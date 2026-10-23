import { useState } from "react";
import { fmtUsd, type AiStatus, type HoodEvent } from "@medilog/engine";

const KIND: Record<HoodEvent["kind"], { icon: string; label: string }> = {
  device: { icon: "📱", label: "On device" },
  safety: { icon: "🛡️", label: "Safety" },
  privacy: { icon: "✂️", label: "Privacy" },
  ai: { icon: "🧠", label: "AI" },
  guard: { icon: "🚧", label: "Guardrail" },
  storage: { icon: "🔒", label: "Storage" },
};

// Typical figures for the COGS projection until real calls have been made.
const DEFAULT_LOG_COST = 0.0004;
const DEFAULT_REPORT_COST = 0.035;
const AUD_TO_USD = 0.65;

export function Hood({ events, status, cloudOn, onClose }: { events: HoodEvent[]; status: AiStatus; cloudOn: boolean; onClose?: () => void }) {
  const aiCalls = events.filter((e) => e.usage && e.kind === "ai" && !e.usage.estimated);
  const spent = aiCalls.reduce((s, e) => s + (e.usage?.costUsd ?? 0), 0);
  const stripped = events.reduce((n, e) => n + (e.redactions?.length ?? 0), 0);
  const logCalls = aiCalls.filter((e) => e.usage!.model === status.models?.extract);
  const reportCalls = aiCalls.filter((e) => e.usage!.model === status.models?.report);
  const avg = (xs: HoodEvent[], fallback: number) => (xs.length ? xs.reduce((s, e) => s + e.usage!.costUsd, 0) / xs.length : fallback);
  const perLog = avg(logCalls, DEFAULT_LOG_COST);
  const perReport = avg(reportCalls, DEFAULT_REPORT_COST);
  const monthly = 30 * perLog + 2 * perReport;

  return (
    <aside className="hood" aria-label="Under the hood">
      <div className="hood-head">
        <div>
          <h2>Under the hood</h2>
          <p className="muted small">What the app is doing, step by step, as you use it.</p>
        </div>
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
      </div>

      <div className={`mode ${cloudOn ? "mode-ai" : ""}`}>
        {cloudOn ? (
          <>
            <strong>Live AI</strong> · {status.models?.extract} for logs, {status.models?.report} for reports, via a stateless relay
          </>
        ) : (
          <>
            <strong>On-device engine</strong> · deterministic extraction, fully offline.{" "}
            {status.ai ? "Claude is available: switch it on in ⚙︎ settings." : "Set ANTHROPIC_API_KEY on the server to use live Claude."}
          </>
        )}
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="tile-v">0 B</span>
          <span className="tile-l">voice audio sent to our servers</span>
        </div>
        <div className="tile">
          <span className="tile-v">{stripped}</span>
          <span className="tile-l">identifiers stripped</span>
        </div>
        <div className="tile">
          <span className="tile-v">0</span>
          <span className="tile-l">health records on our servers</span>
        </div>
        <div className="tile">
          <span className="tile-v">{fmtUsd(spent)}</span>
          <span className="tile-l">AI spend this session</span>
        </div>
      </div>

      <div className="cogs">
        <div className="cogs-row">
          <span>Projected AI cost per active user</span>
          <strong>
            ${monthly.toFixed(3)}
            <small>/month</small>
          </strong>
        </div>
        <p className="muted small">
          30 logs × {fmtUsd(perLog)} + 2 appointment reports × {fmtUsd(perReport)}
          {aiCalls.length ? " (measured this session)" : " (typical)"}. That's {((monthly / (7.99 * AUD_TO_USD)) * 100).toFixed(1)}% of
          a A$7.99 subscription.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="script-card">
          <p className="eyebrow">Suggested demo path · about 3 minutes</p>
          <ol>
            <li>
              <strong>Log:</strong> tap “🌙 3 AM pelvic pain”, then answer the one follow-up.
            </li>
            <li>
              <strong>Timeline:</strong> tap any tag to correct it; note the 30-day pattern.
            </li>
            <li>
              <strong>Appointment:</strong> “Last 30 days”, then compare the patient script with the doctor's one-pager.
            </li>
            <li>
              <strong>Safety:</strong> tap “🚨 Red-flag test” to see the emergency interrupt.
            </li>
          </ol>
        </div>
      ) : (
        <ol className="events">
          {[...events].reverse().map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </ol>
      )}
    </aside>
  );
}

function EventRow({ e }: { e: HoodEvent }) {
  const [open, setOpen] = useState(false);
  const k = KIND[e.kind];
  return (
    <li className={`event event-${e.kind}`}>
      <div className="event-head">
        <span aria-hidden>{k.icon}</span>
        <span className="event-title">{e.title}</span>
        <time>{new Date(e.at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
      </div>
      {e.detail && <p className="event-detail">{e.detail}</p>}
      {e.usage && (
        <p className="event-usage">
          {e.usage.model} · {e.usage.inputTokens.toLocaleString()} in / {e.usage.outputTokens.toLocaleString()} out
          {e.usage.estimated ? " (est.)" : ""} · <strong>{fmtUsd(e.usage.costUsd)}</strong>
        </p>
      )}
      {e.redactions && e.redactions.length > 0 && (
        <p className="event-redactions">
          {e.redactions.map((r, i) => (
            <span key={i} className="redaction">
              <s>{r.original}</s> → {r.type}
            </span>
          ))}
        </p>
      )}
      {e.payload && (
        <>
          <button className="link-btn small" onClick={() => setOpen(!open)}>
            {open ? "Hide" : e.kind === "privacy" && e.detail?.startsWith("Nothing") ? "Show the de-identified text" : "Show exactly what was sent"}
          </button>
          {open && <pre className="payload">{e.payload}</pre>}
        </>
      )}
    </li>
  );
}
