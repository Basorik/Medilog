import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent, type ExpoSpeechRecognitionOptions } from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { deviceLocale, norm, pickEnglish } from "./voiceLocale";

// Voice capture. Recognition runs on the phone whenever an English model is
// installed there (Apple on-device dictation, Android on-device models).
// Otherwise it uses the phone's own speech service, unless the user asked
// for on-device only, in which case they can download the model or type.

export type SpeechMode = "on-device" | "platform" | "unavailable";

export interface VoicePlan {
  mode: SpeechMode;
  lang: string;
  /** Android: an on-device English model exists but isn't downloaded yet. */
  downloadableLocale: string | null;
}

export async function resolveVoicePlan(requireOnDevice: boolean): Promise<VoicePlan> {
  const fallbackLang = norm(deviceLocale()).startsWith("en") ? deviceLocale() : "en-AU";
  const platform: VoicePlan = { mode: requireOnDevice ? "unavailable" : "platform", lang: fallbackLang, downloadableLocale: null };
  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return { ...platform, mode: "unavailable" };
    if (Platform.OS === "web") return { ...platform, mode: "platform" };
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return platform;

    if (Platform.OS === "ios") {
      // iOS can't report which languages have on-device models. Ask for the
      // phone's English; a runtime failure falls back to the platform service.
      return { mode: "on-device", lang: fallbackLang, downloadableLocale: null };
    }

    // Android lists the on-device models that are actually installed (13+).
    const { locales, installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    const installed = pickEnglish(installedLocales);
    if (installed) return { mode: "on-device", lang: installed, downloadableLocale: null };
    return { ...platform, downloadableLocale: pickEnglish(locales) ?? "en-US" };
  } catch {
    // Android 12 and below can't list locales: use the platform service.
    return platform;
  }
}

/** Joins results whether the platform sends cumulative text (iOS) or segments (Android). */
const merge = (committed: string, next: string) =>
  !committed || next.toLowerCase().startsWith(committed.toLowerCase()) ? next : `${committed} ${next}`;

const START_OPTIONS: Omit<ExpoSpeechRecognitionOptions, "lang"> = {
  interimResults: true,
  continuous: true,
  addsPunctuation: true,
  iosTaskHint: "dictation",
  contextualStrings: ["ibuprofen", "paracetamol", "naproxen", "Panadol", "Nurofen", "endometriosis", "migraine", "nauseous"],
};

export function useVoiceNote(requireOnDevice: boolean) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<VoicePlan | null>(null);
  const [downloading, setDownloading] = useState(false);
  const committed = useRef("");
  const onEnd = useRef<((text: string) => void) | null>(null);
  const attempt = useRef<{ lang: string; onDevice: boolean; retried: boolean } | null>(null);
  const retryOnPlatform = useRef(false);

  const refreshPlan = useCallback(async () => setPlan(await resolveVoicePlan(requireOnDevice)), [requireOnDevice]);
  useEffect(() => {
    let live = true;
    void resolveVoicePlan(requireOnDevice).then((p) => {
      if (live) setPlan(p);
    });
    return () => {
      live = false;
    };
  }, [requireOnDevice]);

  const begin = useCallback((lang: string, onDevice: boolean, retried: boolean) => {
    attempt.current = { lang, onDevice, retried };
    ExpoSpeechRecognitionModule.start({ ...START_OPTIONS, lang, requiresOnDeviceRecognition: onDevice });
  }, []);

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
    const a = attempt.current;
    // On-device model missing for this language: quietly switch this
    // session to the phone's speech service, unless the user forbade it.
    if (e.error === "language-not-supported" && a?.onDevice && !a.retried && !requireOnDevice) {
      retryOnPlatform.current = true;
      setPlan((p) => (p ? { ...p, mode: "platform" } : p));
      return;
    }
    setError(
      e.error === "not-allowed"
        ? "Microphone or speech permission is off. You can allow it in your phone's Settings, or type instead."
        : e.error === "language-not-supported"
          ? Platform.OS === "android"
            ? "On-device English isn't downloaded on this phone yet. Download it below, or type instead."
            : "On-device English dictation isn't set up on this iPhone. Turn on Dictation for English in Settings → General → Keyboard, or type instead."
          : e.error === "network"
            ? "Voice needs a connection on this phone. Type instead, or try again when you're online."
            : `Voice capture stopped (${e.error}). You can type instead.`,
    );
  });
  useSpeechRecognitionEvent("end", () => {
    if (retryOnPlatform.current && attempt.current) {
      retryOnPlatform.current = false;
      begin(attempt.current.lang, false, true);
      return;
    }
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
      const p = plan ?? (await resolveVoicePlan(requireOnDevice));
      if (p.mode === "unavailable") {
        setError(
          p.downloadableLocale
            ? "Voice is set to stay on this phone, and on-device English isn't downloaded yet. Download it below, or type instead."
            : "Voice isn't available on this phone with your current settings. Type instead.",
        );
        return false;
      }
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError("Microphone or speech permission is off. You can allow it in your phone's Settings, or type instead.");
        return false;
      }
      onEnd.current = whenDone;
      begin(p.lang, p.mode === "on-device", false);
      return true;
    },
    [plan, requireOnDevice, begin],
  );

  /** Android: fetch the on-device English model so voice can stay on the phone. */
  const downloadModel = useCallback(async () => {
    if (!plan?.downloadableLocale) return;
    setDownloading(true);
    setError(null);
    try {
      const r = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: plan.downloadableLocale });
      if (r.status === "download_scheduled") setError("Download queued. It may wait for Wi-Fi; voice will switch to on-device once it finishes.");
      await refreshPlan();
    } catch (err) {
      setError(`Couldn't start the download: ${(err as Error).message}`);
    } finally {
      setDownloading(false);
    }
  }, [plan, refreshPlan]);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);
  const cancel = useCallback(() => {
    onEnd.current = null;
    retryOnPlatform.current = false;
    ExpoSpeechRecognitionModule.abort();
  }, []);

  return { listening, transcript, error, plan, downloading, start, stop, cancel, downloadModel, refreshPlan };
}
