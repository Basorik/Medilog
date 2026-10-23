import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useCallback, useRef, useState } from "react";

// Voice capture. Recognition runs on the phone whenever the OS supports it
// (Apple on-device dictation, Android on-device models). Where it doesn't,
// the app either falls back to the platform's own speech service or, if the
// user asked for on-device only, to typing.

export type SpeechMode = "on-device" | "platform" | "unavailable";

export function speechMode(requireOnDevice: boolean): SpeechMode {
  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return "unavailable";
    if (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return "on-device";
    return requireOnDevice ? "unavailable" : "platform";
  } catch {
    return "unavailable";
  }
}

/** Joins results whether the platform sends cumulative text (iOS) or segments (Android). */
const merge = (committed: string, next: string) =>
  !committed || next.toLowerCase().startsWith(committed.toLowerCase()) ? next : `${committed} ${next}`;

export function useVoiceNote(requireOnDevice: boolean) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const committed = useRef("");
  const onEnd = useRef<((text: string) => void) | null>(null);

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("result", (e) => {
    const text = e.results[0]?.transcript?.trim() ?? "";
    if (!text) return;
    if (e.isFinal) {
      committed.current = merge(committed.current, text);
      setTranscript(committed.current);
    } else setTranscript(merge(committed.current, text));
  });
  useSpeechRecognitionEvent("error", (e) => {
    if (e.error === "aborted" || e.error === "no-speech") return;
    setError(
      e.error === "not-allowed"
        ? "Microphone or speech permission is off. You can allow it in Settings, or type instead."
        : e.error === "language-not-supported"
          ? "On-device speech isn't installed for English on this phone yet. Type instead, or allow the platform speech service in Medilog settings."
          : `Voice capture stopped (${e.error}). You can type instead.`,
    );
  });
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    const text = committed.current.trim();
    onEnd.current?.(text);
    onEnd.current = null;
  });

  const start = useCallback(
    async (whenDone: (text: string) => void) => {
      setError(null);
      setTranscript("");
      committed.current = "";
      const mode = speechMode(requireOnDevice);
      if (mode === "unavailable") {
        setError("Voice isn't available on this phone with your current settings. Type instead.");
        return false;
      }
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError("Microphone or speech permission is off. You can allow it in Settings, or type instead.");
        return false;
      }
      onEnd.current = whenDone;
      ExpoSpeechRecognitionModule.start({
        lang: "en-AU",
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: mode === "on-device",
        addsPunctuation: true,
        iosTaskHint: "dictation",
        contextualStrings: ["ibuprofen", "paracetamol", "naproxen", "Panadol", "Nurofen", "endometriosis", "migraine", "nauseous"],
      });
      return true;
    },
    [requireOnDevice],
  );

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);
  const cancel = useCallback(() => {
    onEnd.current = null;
    ExpoSpeechRecognitionModule.abort();
  }, []);

  return { listening, transcript, error, start, stop, cancel };
}
