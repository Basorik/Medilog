import { useEffect, useRef, useState } from "react";
import { coverage, entrySummary, type Entry, type FollowUpOption, type SlotKey } from "@medilog/engine";
import { useSpeech } from "../lib/speech";
import { EngineBadge, Icon } from "./ui";

export const SAMPLES = [
  { label: "3 AM pelvic pain", text: "Woke up at 3 AM with that sharp cramping in my lower right side again, took two ibuprofen and used a heat pack." },
  { label: "Migraine at work", text: "Migraine started around 2pm behind my right eye, throbbing, lights are really bothering me. Had to leave work early." },
  { label: "Morning joint flare", text: "My knees and wrists are swollen and stiff this morning, took over an hour to loosen up. Couldn't open jars." },
  { label: "Red-flag test", text: "Sudden crushing chest pain spreading into my left arm and I'm sweating.", danger: true },
];

const SLOTS: { key: SlotKey; label: string }[] = [
  { key: "site", label: "Site" },
  { key: "onset", label: "Onset" },
  { key: "character", label: "Character" },
  { key: "radiation", label: "Radiation" },
  { key: "associated", label: "Associated" },
  { key: "timing", label: "Timing" },
  { key: "modifiers", label: "Modifiers" },
  { key: "severity", label: "Severity" },
  { key: "function", label: "Function" },
  { key: "relief", label: "Relief" },
];

type Phase = "idle" | "listening" | "typing" | "processing" | "followup" | "done";

interface Props {
  entry: Entry | null;
  busy: boolean;
  onSubmit: (text: string, source: "voice" | "text") => void;
  onAnswer: (option: FollowUpOption | null) => void;
  onReset: () => void;
  onOpenTimeline: () => void;
  profileName: string;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Rough night?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export function Capture({ entry, busy, onSubmit, onAnswer, onReset, onOpenTimeline, profileName }: Props) {
  const speech = useSpeech();
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState("");
  const [simulating, setSimulating] = useState(false);
  const timer = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  // Drive the phase from the parent's processing state.
  useEffect(() => {
    if (busy) setPhase("processing");
    else if (phase === "processing") setPhase(entry ? "followup" : "idle");
  }, [busy, entry, phase]);

  useEffect(() => {
    if (phase !== "listening") return;
    setSeconds(0);
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // Real microphone: when recognition ends, submit what was heard.
  const heard = useRef(false);
  useEffect(() => {
    if (speech.listening) {
      heard.current = true;
      return;
    }
    if (!heard.current) return;
    heard.current = false;
    if (speech.transcript) onSubmit(speech.transcript, "voice");
    else setPhase(speech.error ? "typing" : "idle");
  }, [speech.listening, speech.transcript, speech.error, onSubmit]);

  useEffect(() => () => void (timer.current && window.clearInterval(timer.current)), []);

  const startMic = () => {
    if (!speech.supported) return setPhase("typing");
    setPhase("listening");
    speech.start();
  };

  const simulate = (text: string) => {
    setPhase("listening");
    setSimulating(true);
    speech.setTranscript("");
    const words = text.split(" ");
    let i = 0;
    timer.current = window.setInterval(() => {
      i++;
      speech.setTranscript(words.slice(0, i).join(" "));
      if (i >= words.length) {
        window.clearInterval(timer.current!);
        window.setTimeout(() => {
          setSimulating(false);
          onSubmit(text, "voice");
        }, 450);
      }
    }, 95);
  };

  const reset = () => {
    setDraft("");
    speech.setTranscript("");
    setPhase("idle");
    onReset();
  };

  if (phase === "processing" || ((phase === "followup" || phase === "done") && entry)) {
    const shown: Phase = phase === "processing" ? phase : entry?.followUp && !entry.followUp.answer ? "followup" : "done";
    return <Result phase={shown} entry={entry} transcript={entry?.rawText ?? speech.transcript ?? draft} onAnswer={onAnswer} onReset={reset} onOpenTimeline={onOpenTimeline} />;
  }

  return (
    <div className="screen capture">
      <header className="screen-head">
        <h1>
          {greeting()}
          {profileName ? `, ${profileName.split(" ")[0]}` : ""}
        </h1>
        <p className="muted">{new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</p>
      </header>

      {phase === "typing" ? (
        <div className="typer">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Woke at 3am with sharp pain low on my right side, took ibuprofen…"
            rows={4}
          />
          <button className="btn primary block" disabled={!draft.trim()} onClick={() => onSubmit(draft.trim(), "text")}>
            Save note
          </button>
          <button className="link-btn" onClick={() => setPhase("idle")}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="mic-zone">
          <button
            className={`mic ${phase === "listening" ? "mic-live" : ""}`}
            onClick={phase === "listening" ? () => !simulating && speech.stop() : startMic}
            aria-label={phase === "listening" ? "Stop recording" : "Start recording"}
          >
            <span className="mic-ring" />
            <span className="mic-ring delay" />
            <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden>
              {phase === "listening" ? (
                <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
              ) : (
                <path
                  fill="currentColor"
                  d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15Zm6-3.5a.75.75 0 0 0-1.5 0 4.5 4.5 0 0 1-9 0 .75.75 0 0 0-1.5 0 6 6 0 0 0 5.25 5.95V20h-2a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-2v-2.55A6 6 0 0 0 18 11.5Z"
                />
              )}
            </svg>
          </button>
          <p className="mic-hint">
            {phase === "listening" ? (
              <>
                <span className="rec-dot" /> Listening · 0:{String(seconds).padStart(2, "0")} {!simulating && "· tap to finish"}
              </>
            ) : speech.supported ? (
              "Tap and tell me how you feel"
            ) : (
              "Voice isn't available in this browser"
            )}
          </p>
          {phase === "listening" && <p className="live-transcript">{speech.transcript || <span className="muted">…</span>}</p>}
          {phase === "idle" && (
            <button className="link-btn" onClick={() => setPhase("typing")}>
              Type instead
            </button>
          )}
        </div>
      )}

      {phase === "idle" && (
        <div className="samples">
          <p className="caption">Try a demo phrase</p>
          <div className="sample-row">
            {SAMPLES.map((s) => (
              <button key={s.label} className={`sample ${s.danger ? "sample-danger" : ""}`} onClick={() => simulate(s.text)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Result({
  phase,
  entry,
  transcript,
  onAnswer,
  onReset,
  onOpenTimeline,
}: {
  phase: Phase;
  entry: Entry | null;
  transcript: string;
  onAnswer: (o: FollowUpOption | null) => void;
  onReset: () => void;
  onOpenTimeline: () => void;
}) {
  if (phase === "done" && entry) {
    return (
      <div className="screen done">
        <div className="done-mark">
          <Icon name="check" size={30} />
        </div>
        <h2>Saved to your timeline</h2>
        <p className="muted">{entrySummary(entry.fields) || "Your note is saved."}</p>
        <button className="btn primary block" onClick={onReset}>
          Log another
        </button>
        <button className="link-btn" onClick={onOpenTimeline}>
          See timeline
        </button>
        <p className="caption">
          <EngineBadge engine={entry.engine} /> Stored encrypted on this phone
        </p>
      </div>
    );
  }

  const cov = entry ? coverage(entry.fields) : null;
  const targets = new Set(entry?.followUp && !entry.followUp.answer ? entry.followUp.targets : []);
  const captured = cov ? SLOTS.filter((s) => cov[s.key]).length : 0;

  return (
    <div className="screen capture-result">
      <blockquote className="said">“{transcript}”</blockquote>

      <div className="schema">
        <div className="schema-head">
          <span>{phase === "processing" ? "Mapping to clinical history…" : `${captured} of ${SLOTS.length} clinical details captured`}</span>
          {entry && <EngineBadge engine={entry.engine} />}
        </div>
        <div className="slots">
          {SLOTS.map((s, i) => (
            <span
              key={s.key}
              className={`slot ${phase === "processing" ? "slot-scan" : cov?.[s.key] ? "slot-on" : targets.has(s.key) ? "slot-ask" : "slot-off"}`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {entry && phase === "followup" && entry.followUp && (
        <div className="followup">
          <p className="followup-q">{entry.followUp.question.replace(/^Logged\.\s*/, "")}</p>
          <div className="choices">
            {entry.followUp.options.map((o) => (
              <button key={o.label} className="choice" onClick={() => onAnswer(o)}>
                {o.label}
              </button>
            ))}
          </div>
          <button className="link-btn" onClick={() => onAnswer(null)}>
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
