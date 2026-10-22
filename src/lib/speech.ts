import { useCallback, useEffect, useRef, useState } from "react";

// Thin wrapper over the Web Speech API. Where the browser supports on-device
// recognition (processLocally) we ask for it; otherwise the browser's engine
// decides. The production app uses an on-device Whisper/Moonshine model.

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  processLocally?: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type Ctor = new () => SpeechRecognitionLike;

const getCtor = (): Ctor | undefined => {
  const w = globalThis as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export function useSpeech(lang = "en-AU") {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const finalText = useRef("");
  const supported = typeof window !== "undefined" && !!getCtor();

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const C = getCtor();
    if (!C) return;
    setError(null);
    finalText.current = "";
    setTranscript("");
    const r = new C();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = true;
    if ("processLocally" in r) r.processLocally = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript;
        else interim += res[0].transcript;
      }
      setTranscript((finalText.current + interim).trim());
    };
    r.onerror = (e) => {
      // On-device language pack missing: retry once with the browser's default engine.
      if (r.processLocally && /language-not-supported|service-not-allowed/.test(e.error)) {
        r.processLocally = false;
        try {
          r.start();
          return;
        } catch {
          /* fall through */
        }
      }
      setError(e.error === "not-allowed" ? "Microphone permission was blocked." : `Speech error: ${e.error}`);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [lang]);

  useEffect(() => () => rec.current?.stop(), []);

  return { supported, listening, transcript, setTranscript, error, start, stop };
}
