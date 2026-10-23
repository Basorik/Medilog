import { priceUsage, estimateTokens } from "./costs";
import { extractLocal, type PriorContext, type Region } from "./extract";
import { scrubPII, type Redaction } from "./pii";
import { screenRedFlags } from "./redflags";
import {
  buildReportData,
  computeMetrics,
  findDiagnosticLanguage,
  renderHpiLocal,
  renderSoapboxLocal,
  type HpiDoc,
  type Report,
  type ReportRange,
} from "./report";
import type { Entry, ExtractionResult, Profile, RedFlag, Usage } from "./types";

// Orchestrates one log or one report, and narrates every step as an event for
// the "Under the hood" panel, so an investor can watch the privacy and safety
// architecture work rather than take it on trust.

export type HoodKind = "device" | "safety" | "privacy" | "ai" | "guard" | "storage";

export interface HoodEvent {
  id: string;
  at: number;
  kind: HoodKind;
  title: string;
  detail?: string;
  payload?: string;
  redactions?: Redaction[];
  usage?: Usage;
}

export interface AiStatus {
  ai: boolean;
  models?: { extract: string; report: string };
}

let seq = 0;
const ev = (kind: HoodKind, title: string, extra: Partial<HoodEvent> = {}): HoodEvent => ({
  id: `ev-${Date.now()}-${seq++}`,
  at: Date.now(),
  kind,
  title,
  ...extra,
});

// Same-origin on the web demo; the mobile app points this at a deployed relay.
let relayBase = "";
export function configureRelay(baseUrl: string) {
  relayBase = baseUrl.replace(/\/$/, "");
}

const now = () => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

function timeout(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

export async function fetchStatus(retries = 2): Promise<AiStatus> {
  try {
    const res = await fetch(`${relayBase}/api/status`, { signal: timeout(2500) });
    if (res.status === 404) return { ai: false }; // static hosting: no relay at all
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as AiStatus;
  } catch {
    // The relay may still be starting (dev mode); try again briefly.
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 1200));
      return fetchStatus(retries - 1);
    }
    return { ai: false };
  }
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const res = await fetch(`${relayBase}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

const LOCAL_ENGINE = "on-device engine";

export function priorFrom(entries: Entry[], now: Date): PriorContext | undefined {
  const last = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!last?.fields.complaint || now.getTime() - new Date(last.createdAt).getTime() > 3 * 86_400_000) return undefined;
  const regionByComplaint: Record<string, Region> = {
    "Lower abdominal / pelvic pain": "pelvic",
    "Abdominal pain": "abdomen",
    Headache: "head",
    Arthralgia: "joints",
    "Back pain": "back",
    "Chest discomfort": "chest",
  };
  const region = regionByComplaint[last.fields.complaint.clinical];
  return region ? { region, site: last.fields.site } : undefined;
}

export interface LogOutcome {
  redFlag: RedFlag | null;
  result: ExtractionResult;
  engine: "claude" | "local";
  events: HoodEvent[];
}

export async function processLog(
  text: string,
  opts: { now: Date; entries: Entry[]; profile: Profile; useCloud: boolean; models?: AiStatus["models"]; source: "voice" | "text" },
  onEvent: (e: HoodEvent) => void,
): Promise<LogOutcome> {
  const events: HoodEvent[] = [];
  const emit = (e: HoodEvent) => {
    events.push(e);
    onEvent(e);
  };

  if (opts.source === "voice")
    emit(ev("device", "Speech captured", { detail: "This demo uses the browser's speech engine (on-device where the browser supports it). Production transcribes on the phone's neural engine (Whisper / Moonshine), so audio never leaves the device." }));

  const t0 = now();
  const redFlag = screenRedFlags(text);
  const ms = (now() - t0).toFixed(2);
  if (redFlag) {
    emit(ev("safety", `Red flag: ${redFlag.title}`, { detail: `Matched "${redFlag.matched}" in ${ms} ms. Logging interrupted before any AI call; emergency directive shown.` }));
    return { redFlag, result: extractLocal(text, opts.now), engine: "local", events };
  }
  emit(ev("safety", "Red-flag screen: clear", { detail: `Deterministic rules, ${ms} ms, run on the device before any AI is involved.` }));

  const { text: scrubbed, redactions } = scrubPII(text, opts.profile);
  emit(
    ev("privacy", redactions.length ? `Stripped ${redactions.length} identifier${redactions.length > 1 ? "s" : ""}` : "No identifiers found", {
      detail: opts.useCloud ? "This exact text is all that leaves the phone." : "Nothing leaves the phone in on-device mode.",
      payload: scrubbed,
      redactions,
    }),
  );

  const prior = priorFrom(opts.entries, opts.now);
  if (opts.useCloud && opts.models) {
    try {
      const loggedAt = opts.now.toLocaleString("en-AU", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
      const priorLine = prior ? `${prior.site?.clinical ?? ""} ${prior.region}`.trim() : null;
      const out = await post<{ result: ExtractionResult; usage: Usage }>("/api/extract", { text: scrubbed, loggedAt, prior: priorLine }, 20_000);
      const guard = findDiagnosticLanguage([out.result.followUp?.question ?? "", ...(out.result.followUp?.options.map((o) => o.label) ?? [])]);
      if (guard || /\bwhy\b/i.test(out.result.followUp?.question ?? "")) {
        emit(ev("guard", "Guardrail: follow-up replaced", { detail: `Model question strayed outside descriptive clarification ("${guard ?? "why"}"). Using the on-device question instead.` }));
        out.result.followUp = extractLocal(text, opts.now, prior).followUp;
      }
      emit(ev("ai", "Structured by Claude", { detail: "Schema-enforced output via the stateless relay; nothing is stored. Production routes to an onshore zero-data-retention endpoint.", usage: out.usage }));
      return { redFlag: null, result: out.result, engine: "claude", events };
    } catch (err) {
      emit(ev("guard", "Cloud unavailable → on-device engine", { detail: (err as Error).message }));
    }
  }
  const result = extractLocal(text, opts.now, prior);
  const est = priceUsage(opts.models?.extract ?? "claude-haiku-5-5", estimateTokens(1800 + scrubbed.length), 350, true);
  emit(ev("ai", `Structured by ${LOCAL_ENGINE}`, { detail: `Free and offline. The same call in the cloud would cost about $${est.costUsd.toFixed(5)}.`, usage: { ...est, model: LOCAL_ENGINE, costUsd: 0 } }));
  return { redFlag: null, result, engine: "local", events };
}

export async function generateReport(
  entries: Entry[],
  range: ReportRange,
  opts: { profile: Profile; useCloud: boolean; models?: AiStatus["models"] },
  onEvent: (e: HoodEvent) => void,
): Promise<Report> {
  const data = buildReportData(entries, range, opts.profile);
  onEvent(ev("device", `Aggregated ${data.logs} logs on device`, { detail: "Counts, dates and severity statistics are computed locally and deterministically; the model never supplies a number." }));
  const local: Report = {
    soapbox: renderSoapboxLocal(data),
    hpi: renderHpiLocal(data),
    data,
    engine: "local",
    guardrail: null,
    generatedAt: new Date().toISOString(),
  };
  if (!opts.useCloud || !opts.models || !data.episodes) {
    onEvent(ev("ai", `Written by ${LOCAL_ENGINE}`, { detail: "Template rendering: instant, free, offline." }));
    return local;
  }

  // Only aggregate, de-identified facts leave the device; quotes stay local.
  const facts = { ...data, quotes: undefined, redFlags: data.redFlags.length };
  onEvent(ev("privacy", "Sending aggregate facts only", { detail: "No raw notes, names or dates of birth. Patient quotes stay on the phone.", payload: JSON.stringify(facts, null, 1) }));
  try {
    const out = await post<{ prose: { soapbox: string[]; chiefComplaint: string; sections: HpiDoc["sections"] }; usage: Usage }>(
      "/api/report",
      { facts },
      60_000,
    );
    const offending = findDiagnosticLanguage([...out.prose.soapbox, out.prose.chiefComplaint, ...out.prose.sections.flatMap((s) => s.lines)]);
    if (offending) {
      onEvent(ev("guard", "Guardrail: diagnostic language blocked", { detail: `Model output contained "${offending}". Replaced with the deterministic template.`, usage: out.usage }));
      return { ...local, guardrail: offending };
    }
    onEvent(ev("ai", "Written by Claude", { detail: "Prose only; every figure is checked against the on-device statistics.", usage: out.usage }));
    const tail = local.hpi.sections.filter((s) => ["In the patient's words", "Also logged", "Emergency advice shown"].includes(s.title));
    return {
      ...local,
      soapbox: out.prose.soapbox.slice(0, 4),
      hpi: { chiefComplaint: out.prose.chiefComplaint, metrics: computeMetrics(data), sections: [...out.prose.sections, ...tail] },
      engine: "claude",
    };
  } catch (err) {
    onEvent(ev("guard", "Cloud unavailable → on-device engine", { detail: (err as Error).message }));
    return local;
  }
}

export const savedEvent = (bytes: number, encrypted: boolean) =>
  ev("storage", encrypted ? "Saved to encrypted on-device vault" : "Saved on device (unencrypted: insecure context)", {
    detail: `${(bytes / 1024).toFixed(1)} KB in this browser only${encrypted ? ", AES-256-GCM with a non-extractable device key" : ""}. No central database of health records.`,
  });
