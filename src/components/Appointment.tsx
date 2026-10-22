import { useEffect, useState } from "react";
import { fmtDate, makeRange, reportToText, type RangeKey, type Report } from "../lib/report";
import type { Entry, Profile } from "../lib/types";
import { EngineBadge } from "./ui";

interface Props {
  entries: Entry[];
  profile: Profile;
  report: Report | null;
  busy: boolean;
  onGenerate: (key: RangeKey) => void;
}

export function Appointment({ entries, profile, report, busy, onGenerate }: Props) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [view, setView] = useState<"script" | "doctor">("script");
  const now = new Date();
  const options: RangeKey[] = profile.lastConsult ? ["7d", "30d", "90d", "since-consult"] : ["7d", "30d", "90d"];
  const r = makeRange(range, now, profile.lastConsult);
  const inRange = entries.filter((e) => new Date(e.createdAt) >= r.start).length;

  useEffect(() => setView("script"), [report?.generatedAt]);

  return (
    <div className="screen appointment">
      <header className="screen-head">
        <h1>Appointment mode</h1>
        <p className="muted">Turn your logs into a 60-second opener for you, and a one-page history for your doctor.</p>
      </header>

      <div className="range-row" role="radiogroup" aria-label="Timeframe">
        {options.map((k) => (
          <button key={k} role="radio" aria-checked={range === k} className={`chip ${range === k ? "chip-on" : ""}`} onClick={() => setRange(k)}>
            {k === "since-consult" ? "Since last consult" : makeRange(k, now, null).label}
          </button>
        ))}
      </div>
      <button className="btn primary block" disabled={busy || !inRange} onClick={() => onGenerate(range)}>
        {busy ? "Preparing…" : `Prepare my appointment · ${inRange} log${inRange === 1 ? "" : "s"}`}
      </button>

      {busy && (
        <div className="prep-steps">
          <p>Counting episodes and severity on your phone…</p>
          <p>Checking what you've tried and what it changed…</p>
          <p>Writing your opener and the doctor's one-pager…</p>
        </div>
      )}

      {report && !busy && (
        <>
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={view === "script"} className={view === "script" ? "seg-on" : ""} onClick={() => setView("script")}>
              🗣 My script
            </button>
            <button role="tab" aria-selected={view === "doctor"} className={view === "doctor" ? "seg-on" : ""} onClick={() => setView("doctor")}>
              🩺 For the doctor
            </button>
          </div>
          {view === "script" ? <Script report={report} /> : <OnePager report={report} profile={profile} />}
        </>
      )}
    </div>
  );
}

function Script({ report }: { report: Report }) {
  const [speaking, setSpeaking] = useState(false);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const speak = () => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(report.soapbox.join(" "));
    u.lang = "en-AU";
    u.rate = 0.95;
    u.onend = () => setSpeaking(false);
    speechSynthesis.speak(u);
    setSpeaking(true);
  };
  useEffect(() => () => void (canSpeak && speechSynthesis.cancel()), [canSpeak]);

  return (
    <section className="script">
      <div className="script-head">
        <span className="eyebrow">Your 60-second opener · read it before the questions start</span>
        <EngineBadge engine={report.engine} />
      </div>
      <ol>
        {report.soapbox.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      {canSpeak && (
        <button className="btn ghost block" onClick={speak}>
          {speaking ? "■ Stop" : "▶ Practise: read it aloud to me"}
        </button>
      )}
    </section>
  );
}

function OnePager({ report, profile }: { report: Report; profile: Profile }) {
  const [copied, setCopied] = useState(false);
  const text = reportToText(report, profile.name || undefined);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };
  const mail = `mailto:?subject=${encodeURIComponent(`Pre-appointment history${profile.name ? ` — ${profile.name}` : ""}`)}&body=${encodeURIComponent(text)}`;

  return (
    <section className="onepager-wrap">
      <article className="hpi-doc">
        <header className="hpi-top">
          <div>
            <p className="hpi-kicker">Patient-prepared history of presenting illness</p>
            <p className="hpi-who">
              {profile.name || "Patient"}
              {profile.dob && <span> · DOB {profile.dob}</span>}
            </p>
          </div>
          <div className="hpi-when">
            <span>{report.data.range.label}</span>
            <span>
              {fmtDate(report.data.range.start)} – {fmtDate(report.data.range.end)}
            </span>
          </div>
        </header>
        <p className="hpi-cc">
          <span className="hpi-label">CC</span> {report.hpi.chiefComplaint}
        </p>
        <dl className="hpi-metrics">
          {report.hpi.metrics.map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
        {report.hpi.sections.map((s) => (
          <section key={s.title} className="hpi-sec">
            <h4>{s.title}</h4>
            <ul>
              {s.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
        ))}
        <footer className="hpi-foot">
          From {report.data.logs} patient-entered logs, recorded at the time of symptoms. Descriptive only: this tool makes no diagnosis and gives no
          treatment advice.
          {report.guardrail && <> Safety template used.</>}
        </footer>
      </article>
      <div className="row actions">
        <button className="btn ghost" onClick={() => window.print()}>
          🖨 Print / PDF
        </button>
        <button className="btn ghost" onClick={copy}>
          {copied ? "✓ Copied" : "📋 Copy"}
        </button>
        <a className="btn ghost" href={mail}>
          ✉️ Email
        </a>
      </div>
    </section>
  );
}
