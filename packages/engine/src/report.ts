import { scrubPII } from "./pii";
import type { Entry, Profile, Term } from "./types";

// Appointment Mode. Numbers are always computed here, deterministically, from
// the patient's own logs. A model may phrase the prose, but it never supplies
// a count, a date or a severity score.

export type RangeKey = "7d" | "30d" | "90d" | "since-consult";

export interface ReportRange {
  key: RangeKey;
  label: string;
  start: Date;
  end: Date;
  days: number;
}

export interface Count {
  patient: string;
  clinical: string;
  n: number;
}

export interface TreatmentStat {
  name: string;
  uses: number;
  helped: number;
  partial: number;
  none: number;
  unknown: number;
  dose: string | null;
}

export interface ReportData {
  range: { label: string; start: string; end: string; days: number };
  logs: number;
  complaint: Term;
  episodes: number;
  symptomaticDays: number;
  first: string | null;
  last: string | null;
  severity: { median: number; min: number; max: number; firstHalf: number | null; secondHalf: number | null; n: number } | null;
  sites: Count[];
  characters: Count[];
  radiation: Count[];
  nocturnal: { n: number; from: string | null; to: string | null } | null;
  durations: Count[];
  associated: Count[];
  negatives: Count[];
  aggravating: Count[];
  relieving: Count[];
  treatments: TreatmentStat[];
  functional: Count[];
  workDaysMissed: number;
  sleepNights: number;
  cycle: { periodStarts: string[]; perimenstrual: number } | null;
  otherComplaints: Count[];
  redFlags: { date: string; title: string }[];
  quotes: string[];
}

export interface HpiDoc {
  chiefComplaint: string;
  metrics: { label: string; value: string }[];
  sections: { title: string; lines: string[] }[];
}

export interface Report {
  soapbox: string[];
  hpi: HpiDoc;
  data: ReportData;
  engine: "claude" | "local";
  guardrail: string | null;
  generatedAt: string;
}

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
export const fmtDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const fmtClock = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function makeRange(key: RangeKey, now: Date, lastConsult: string | null): ReportRange {
  const end = now;
  const daysFor = { "7d": 7, "30d": 30, "90d": 90 } as const;
  if (key === "since-consult" && lastConsult) {
    const start = startOfDay(new Date(lastConsult));
    const days = Math.max(1, Math.round((startOfDay(now).getTime() - start.getTime()) / DAY));
    return { key, label: `Since last consult (${fmtDate(start)})`, start, end, days };
  }
  const days = key === "since-consult" ? 30 : daysFor[key];
  return { key, label: `Last ${days} days`, start: startOfDay(new Date(now.getTime() - (days - 1) * DAY)), end, days };
}

function tally(entries: Entry[], pick: (e: Entry) => Term[]): Count[] {
  const map = new Map<string, Count>();
  for (const e of entries) {
    const seen = new Set<string>();
    for (const t of pick(e)) {
      const k = t.clinical.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const c = map.get(k) ?? { patient: t.patient, clinical: t.clinical, n: 0 };
      c.n++;
      map.set(k, c);
    }
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
};
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function buildReportData(all: Entry[], range: ReportRange, profile?: Partial<Profile>): ReportData {
  const inRange = all
    .filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t >= range.start.getTime() && t <= range.end.getTime();
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const complaints = tally(inRange, (e) => (e.fields.complaint ? [e.fields.complaint] : []));
  const main = complaints[0] ?? { patient: "No symptoms logged", clinical: "No symptoms logged", n: 0 };
  const episodes = inRange.filter((e) => e.fields.complaint?.clinical === main.clinical);
  const sev = episodes.map((e) => e.fields.severity).filter((s): s is number => s !== null);
  const midpoint = range.start.getTime() + (range.end.getTime() - range.start.getTime()) / 2;
  const sevHalf = (first: boolean) =>
    mean(
      episodes
        .filter((e) => (new Date(e.createdAt).getTime() < midpoint) === first)
        .map((e) => e.fields.severity)
        .filter((s): s is number => s !== null),
    );

  const nocturnal = episodes.filter((e) => e.fields.nocturnal);
  // Prefer the time the patient stated ("woke at 3") over when they got round to logging it.
  const nocturnalTimes = nocturnal
    .map((e) => e.fields.onsetTime ?? (new Date(e.createdAt).getHours() < 7 ? fmtClock(new Date(e.createdAt)) : null))
    .filter((t): t is string => t !== null)
    .sort();

  const treatments = new Map<string, TreatmentStat>();
  for (const e of episodes)
    for (const t of e.fields.treatments) {
      const s = treatments.get(t.name) ?? { name: t.name, uses: 0, helped: 0, partial: 0, none: 0, unknown: 0, dose: t.dose };
      s.uses++;
      s[t.efficacy]++;
      treatments.set(t.name, s);
    }

  const daysWith = (pred: (e: Entry) => boolean) => new Set(inRange.filter(pred).map((e) => dayKey(e.createdAt))).size;
  const workDaysMissed = daysWith((e) => e.fields.functional.some((f) => f.clinical === "Absent from work"));
  const sleepNights = daysWith((e) => e.fields.nocturnal || e.fields.functional.some((f) => /^Sleep disturbance/.test(f.clinical)));

  // Cycle: period starts logged anywhere in the history (not just the range),
  // so an episode early in the range can still be matched to its period.
  const periodStarts = all
    .filter((e) => e.fields.cycle?.clinical === "Menses day 1")
    .map((e) => startOfDay(new Date(e.createdAt)).getTime());
  const cycleMentions = episodes.filter((e) => e.fields.cycle);
  let cycle: ReportData["cycle"] = null;
  if (periodStarts.length || cycleMentions.length) {
    const perimenstrual = episodes.filter((e) => {
      const d = startOfDay(new Date(e.createdAt)).getTime();
      const near = periodStarts.some((p) => d - p >= -3 * DAY && d - p <= 4 * DAY);
      return near || ["Menstruating", "Premenstrual", "Menses day 1"].includes(e.fields.cycle?.clinical ?? "");
    }).length;
    cycle = {
      periodStarts: periodStarts.filter((p) => p >= range.start.getTime() - 4 * DAY).map((p) => new Date(p).toISOString()),
      perimenstrual,
    };
  }

  const quotes = [...episodes]
    .sort((a, b) => (b.fields.severity ?? 0) - (a.fields.severity ?? 0))
    .slice(0, 2)
    .map((e) => scrubPII(e.rawText, profile).text);

  return {
    range: { label: range.label, start: range.start.toISOString(), end: range.end.toISOString(), days: range.days },
    logs: inRange.length,
    complaint: { patient: main.patient, clinical: main.clinical },
    episodes: episodes.length,
    symptomaticDays: new Set(episodes.map((e) => dayKey(e.createdAt))).size,
    first: episodes[0]?.createdAt ?? null,
    last: episodes[episodes.length - 1]?.createdAt ?? null,
    severity: sev.length
      ? { median: median(sev), min: Math.min(...sev), max: Math.max(...sev), firstHalf: sevHalf(true), secondHalf: sevHalf(false), n: sev.length }
      : null,
    sites: tally(episodes, (e) => (e.fields.site ? [e.fields.site] : [])),
    characters: tally(episodes, (e) => e.fields.character),
    radiation: tally(episodes, (e) => (e.fields.radiation ? [e.fields.radiation] : [])),
    nocturnal: nocturnal.length
      ? { n: nocturnal.length, from: nocturnalTimes[0] ?? null, to: nocturnalTimes[nocturnalTimes.length - 1] ?? null }
      : null,
    durations: tally(episodes, (e) => (e.fields.duration ? [e.fields.duration] : [])),
    associated: tally(episodes, (e) => e.fields.associated),
    negatives: tally(episodes, (e) => e.fields.negatives),
    aggravating: tally(episodes, (e) => e.fields.exacerbating),
    relieving: tally(episodes, (e) => e.fields.relieving),
    treatments: [...treatments.values()].sort((a, b) => b.uses - a.uses),
    functional: tally(inRange, (e) => e.fields.functional).filter((f) => f.clinical !== "No functional limitation"),
    workDaysMissed,
    sleepNights,
    cycle,
    otherComplaints: complaints.slice(1),
    redFlags: inRange.filter((e) => e.redFlag).map((e) => ({ date: e.createdAt, title: e.redFlag!.title })),
    quotes,
  };
}

// ---------------------------------------------------------------- local rendering

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const spokenTime = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  // Round to the nearest half hour: people remember "around 3", not "03:10".
  const total = Math.round((h * 60 + m) / 30) * 30;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "AM" : "PM"}`;
};
const typicalNight = (n: NonNullable<ReportData["nocturnal"]>) => {
  if (!n.from || !n.to) return null;
  const [fh, fm] = n.from.split(":").map(Number);
  const [th, tm] = n.to.split(":").map(Number);
  const mid = Math.round((fh * 60 + fm + th * 60 + tm) / 2);
  return spokenTime(`${Math.floor(mid / 60)}:${mid % 60}`);
};
const nightWindow = (n: NonNullable<ReportData["nocturnal"]>) => (n.from && n.to ? ` · ${n.from}–${n.to}` : "");
const share = (n: number, of: number) => `${n}/${of}`;

export function renderSoapboxLocal(d: ReportData): string[] {
  if (!d.episodes) return ["I haven't logged any symptoms in this period."];
  const out: string[] = [];
  const chars = d.characters.slice(0, 2).map((c) => lc(c.patient));
  const site = d.sites[0];
  const what = site
    ? `${chars.length ? listJoin(chars) + " " : ""}pain in my ${lc(site.patient)}`
    : `${chars.length ? listJoin(chars) + " " : ""}${lc(d.complaint.patient)}`;
  let first = `I've had ${d.episodes} episode${d.episodes === 1 ? "" : "s"} of ${what} over the last ${d.range.days} days`;
  if (d.nocturnal && d.nocturnal.n / d.episodes >= 0.4) {
    const around = typicalNight(d.nocturnal);
    first += `, ${d.nocturnal.n / d.episodes > 0.5 ? "mostly" : "often"} waking me${around ? ` around ${around}` : " at night"}`;
  }
  out.push(first + ".");

  if (d.severity) {
    const typical = Number.isInteger(d.severity.median) ? `${d.severity.median}` : `${Math.floor(d.severity.median)}–${Math.ceil(d.severity.median)}`;
    let s = `It's usually around ${typical} out of 10, and at its worst it reaches ${d.severity.max}.`;
    if (d.cycle && d.cycle.perimenstrual / d.episodes >= 0.4) s += " It's worst in the days around my period.";
    out.push(s);
  }

  const failed = d.treatments.filter((t) => t.none + t.partial > t.helped).map((t) => (t.name === "Heat pack" ? "heat packs" : t.name.toLowerCase()));
  const impact: string[] = [];
  if (d.workDaysMissed) impact.push(`I've missed ${d.workDaysMissed} day${d.workDaysMissed === 1 ? "" : "s"} of work`);
  if (d.sleepNights >= 2) impact.push(`lost sleep on ${d.sleepNights} nights`);
  const parts: string[] = [];
  if (failed.length) parts.push(`${listJoin(failed).replace(/^./, (c) => c.toUpperCase())} ${failed.length > 1 ? "aren't" : "isn't"} helping`);
  if (impact.length) parts.push(listJoin(impact));
  if (parts.length) out.push(parts.join(", and ") + ".");

  out.push("I'd like us to work out what's causing this and what we can try next.");
  return out;
}

function trendWord(s: NonNullable<ReportData["severity"]>): string {
  if (s.firstHalf === null || s.secondHalf === null) return "";
  const delta = s.secondHalf - s.firstHalf;
  if (delta >= 1) return `worsening (mean ${s.firstHalf} → ${s.secondHalf})`;
  if (delta <= -1) return `improving (mean ${s.firstHalf} → ${s.secondHalf})`;
  return `stable (mean ${s.firstHalf} → ${s.secondHalf})`;
}

export function computeMetrics(d: ReportData): HpiDoc["metrics"] {
  const m: HpiDoc["metrics"] = [{ label: "Episodes", value: `${d.episodes} in ${d.range.days}d` }];
  if (d.severity) m.push({ label: "Severity (NRS)", value: `median ${d.severity.median} · range ${d.severity.min}–${d.severity.max}` });
  if (d.nocturnal) m.push({ label: "Nocturnal onset", value: `${share(d.nocturnal.n, d.episodes)}${nightWindow(d.nocturnal)}` });
  if (d.workDaysMissed) m.push({ label: "Work days lost", value: String(d.workDaysMissed) });
  if (d.cycle && d.cycle.perimenstrual) m.push({ label: "Perimenstrual", value: share(d.cycle.perimenstrual, d.episodes) });
  return m;
}

const counted = (cs: Count[], of: number, max = 4) => cs.slice(0, max).map((c) => `${c.clinical} (${share(c.n, of)})`).join(", ");

export function renderHpiLocal(d: ReportData): HpiDoc {
  const E = d.episodes;
  const sections: HpiDoc["sections"] = [];
  const site = d.sites[0];
  const cc = `${E > 1 ? "Recurrent " : ""}${lc(d.complaint.clinical)}${site ? `, ${site.clinical}` : ""} — ${E} episode${E === 1 ? "" : "s"} over ${d.range.days}d`;

  const course: string[] = [];
  if (d.first && d.last) course.push(`First logged ${fmtDate(d.first)}, most recent ${fmtDate(d.last)}; symptomatic on ${d.symptomaticDays} of ${d.range.days} days.`);
  if (d.severity) course.push(`Severity ${trendWord(d.severity) || "—"}; ${d.severity.n} of ${E} episodes scored.`);
  if (d.durations.length) course.push(`Typical duration: ${counted(d.durations, E, 3)}.`);
  sections.push({ title: "Onset & course", lines: course });

  const socrates: string[] = [];
  if (d.sites.length) socrates.push(`Site: ${counted(d.sites, E, 3)}`);
  if (d.characters.length) socrates.push(`Character: ${counted(d.characters, E)}`);
  if (d.radiation.length) socrates.push(`Radiation: ${counted(d.radiation, E, 2)}`);
  if (d.nocturnal)
    socrates.push(`Timing: nocturnal onset ${share(d.nocturnal.n, E)}${d.nocturnal.from ? `, woken from sleep ${d.nocturnal.from}–${d.nocturnal.to}` : ""}`);
  if (d.aggravating.length) socrates.push(`Aggravating: ${counted(d.aggravating, E, 3)}`);
  if (d.relieving.length) socrates.push(`Relieving: ${counted(d.relieving, E, 3)}`);
  if (d.cycle) {
    const lmp = d.cycle.periodStarts.length ? ` (menses onset logged ${d.cycle.periodStarts.map(fmtDate).join(", ")})` : "";
    socrates.push(`Cycle: ${share(d.cycle.perimenstrual, E)} episodes within −3 to +4 days of menses onset${lmp}`);
  }
  sections.push({ title: "Site · character · timing", lines: socrates });

  if (d.associated.length) sections.push({ title: "Associated symptoms", lines: d.associated.map((a) => `${a.clinical} — ${share(a.n, E)} episodes`) });
  if (d.negatives.length)
    sections.push({
      title: "Pertinent negatives (recorded at time of episode)",
      lines: d.negatives.map((n) => `No ${lc(n.clinical)} — documented absent in ${n.n} episode${n.n === 1 ? "" : "s"}`),
    });

  if (d.treatments.length)
    sections.push({
      title: "Treatments tried",
      lines: d.treatments.map((t) => {
        const parts = [t.helped && `good relief ${t.helped}`, t.partial && `minimal ${t.partial}`, t.none && `no relief ${t.none}`, t.unknown && `not recorded ${t.unknown}`].filter(Boolean);
        return `${t.name}${t.dose ? ` (${t.dose})` : ""} — used ${t.uses}×: ${parts.join(", ")}`;
      }),
    });

  const fn: string[] = [];
  if (d.workDaysMissed) fn.push(`Absent from work: ${d.workDaysMissed} day${d.workDaysMissed === 1 ? "" : "s"}`);
  if (d.sleepNights) fn.push(`Sleep disturbance: ${d.sleepNights} night${d.sleepNights === 1 ? "" : "s"}`);
  for (const f of d.functional) if (!["Absent from work"].includes(f.clinical) && !/^Sleep disturbance/.test(f.clinical)) fn.push(`${f.clinical}: ${f.n}×`);
  if (fn.length) sections.push({ title: "Functional impact (ADLs)", lines: fn });

  if (d.quotes.length) sections.push({ title: "In the patient's words", lines: d.quotes.map((q) => `“${q}”`) });
  if (d.otherComplaints.length) sections.push({ title: "Also logged", lines: d.otherComplaints.map((c) => `${c.clinical} (${c.n}×)`) });
  if (d.redFlags.length)
    sections.push({ title: "Emergency advice shown", lines: d.redFlags.map((r) => `${fmtDate(r.date)}: ${r.title} — patient directed to emergency services`) });

  return { chiefComplaint: cc, metrics: computeMetrics(d), sections };
}

// ---------------------------------------------------------------- safety guard

const DIAGNOSTIC_LANGUAGE =
  /\b(diagnos\w*|likely|probabl[ey]|suggestive of|suggests|consistent with|indicative of|differential|rule out|r\/o|query|\?\s?(endo|appendic)|endometriosis|adenomyosis|appendicitis|ovarian cyst|torsion|pelvic inflammatory|ibs|cancer|tumou?r|lupus|rheumatoid|fibromyalgia|recommend\w*|should (take|start|stop|try)|prescribe\w*)\b/i;

/** Returns the offending phrase if model-written text strays into diagnosis or advice. */
export function findDiagnosticLanguage(texts: string[]): string | null {
  for (const t of texts) {
    // Quoted patient words are the patient's, not the model's.
    const m = t.replace(/“[^”]*”/g, "").match(DIAGNOSTIC_LANGUAGE);
    if (m) return m[0];
  }
  return null;
}

export function reportToText(r: Report, profileName?: string): string {
  const lines = [
    `PATIENT-PREPARED HISTORY — ${r.data.range.label}${profileName ? ` — ${profileName}` : ""}`,
    "",
    "CC: " + r.hpi.chiefComplaint,
    "",
    ...r.hpi.metrics.map((m) => `${m.label}: ${m.value}`),
    "",
    ...r.hpi.sections.flatMap((s) => [s.title.toUpperCase(), ...s.lines.map((l) => `• ${l}`), ""]),
    "Generated from patient-entered logs. Descriptive only: no diagnosis or treatment advice is made by this tool.",
  ];
  return lines.join("\n");
}
