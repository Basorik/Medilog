// Extraction eval: scores an engine against the held-out notes in cases.ts.
//
//   npx tsx eval/run.ts rules
//   ANTHROPIC_API_KEY=... npx tsx eval/run.ts claude
//   npx tsx eval/run.ts local --base-url http://localhost:11434/v1 --model gemma3n:e4b
//
// "local" talks to any OpenAI-compatible server with JSON-schema output
// (Ollama, llama.cpp's llama-server, LM Studio), as a stand-in for the small
// models that run on phones. It uses the exact prompt and schema the relay
// sends to Claude, so the engines are compared like for like.

import { extractLocal, screenRedFlags, type ExtractionResult, type HpiFields, type Term } from "@medilog/engine";
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { EXTRACT_SYSTEM, Extraction, extractionUserMessage, extractWithClaude, normaliseExtraction } from "../server/claude";
import { CASES, RED_FLAG_CASES, URGENT_CARE_CASES, type Case, type Region } from "./cases";

const args = process.argv.slice(2);
const engine = args[0] ?? "rules";
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const verbose = args.includes("--verbose");
// A fixed "logged at" time so runs are reproducible: a weekday morning.
const LOGGED = new Date(2026, 9, 20, 9, 30);

type Extractor = (note: string) => Promise<ExtractionResult>;

function localServer(baseUrl: string, model: string): Extractor {
  const schema = z.toJSONSchema(Extraction);
  return async (note) => {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.LOCAL_API_KEY ?? "local"}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content: extractionUserMessage({ text: note, loggedAt: "Tue 09:30", prior: null }) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "extraction", strict: true, schema } },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const parsed = Extraction.safeParse(JSON.parse(body.choices[0].message.content));
    if (!parsed.success) throw new Error(`schema mismatch: ${parsed.error.issues[0]?.message}`);
    return normaliseExtraction(parsed.data);
  };
}

const extractors: Record<string, () => Extractor> = {
  rules: () => async (note) => extractLocal(note, LOGGED),
  claude: () => async (note) => (await extractWithClaude({ text: note, loggedAt: "Tue 09:30", prior: null })).result,
  local: () => localServer(flag("base-url") ?? "http://localhost:11434/v1", flag("model") ?? "gemma3n:e4b"),
};

// ---------------------------------------------------------------- scoring

const REGIONS: [Region, RegExp][] = [
  ["none", /no symptom|asymptomatic|^none|well day|good day|no complaint|non-specific|feeling unwell/i],
  ["pelvic", /pelvi|lower abdom|menstru|dysmenor|ovar|period|endomet|uter|adnex/i],
  ["head", /head|migrain|cephal/i],
  ["joints", /arthr|joint|knee|wrist|finger|hand|ankle|synov|polyarth/i],
  ["back", /back|lumb|sciat/i],
  ["chest", /chest|thora/i],
  ["abdomen", /abdom|stomach|belly|epigast|gastr|dyspep|reflux|diarr|bowel|cramp/i],
  ["fatigue", /fatigue|tired|exhaust|letharg|malaise|energy/i],
  ["rash", /rash|urtic|hive|skin|derma|welt|wheal|prurit|itch/i],
];
const regionOf = (t: Term | null): Region => (t ? REGIONS.find(([, re]) => re.test(`${t.clinical} ${t.patient}`))?.[0] ?? "none" : "none");
const text = (t: Term) => `${t.patient} ${t.clinical}`;
const rx = (s: string) => new RegExp(s, "i");

interface Score {
  id: string;
  ok: boolean;
  error?: string;
  ms: number;
  complaint?: boolean;
  site?: boolean;
  severity?: boolean;
  inventedSeverity?: boolean;
  nocturnal?: boolean;
  tx: { expected: number; found: number; efficacyRight: number; extra: number };
  terms: { expected: number; found: number; extra: number };
  negatives: { expected: number; found: number; extra: number };
  followUpOk?: boolean;
  misses: string[];
}

function matchTerms(expected: string[], got: Term[], ok: string[]) {
  const found = expected.filter((e) => got.some((t) => rx(e).test(text(t))));
  const extras = got.filter((t) => !expected.some((e) => rx(e).test(text(t))) && !ok.some((o) => rx(o).test(text(t))));
  return { found, extras };
}

function score(c: Case, r: ExtractionResult, ms: number): Score {
  const f: HpiFields = r.fields;
  const e = c.expect;
  const ok = e.ok ?? [];
  const misses: string[] = [];
  const s: Score = { id: c.id, ok: true, ms, tx: { expected: e.treatments.length, found: 0, efficacyRight: 0, extra: 0 }, terms: { expected: 0, found: 0, extra: 0 }, negatives: { expected: 0, found: 0, extra: 0 }, misses };

  const region = regionOf(f.complaint);
  s.complaint = e.complaint.includes(region);
  if (!s.complaint) misses.push(`complaint: got ${region} (${f.complaint?.clinical ?? "null"})`);
  if (e.site) {
    s.site = !!f.site && rx(e.site).test(text(f.site));
    if (!s.site) misses.push(`site: got ${f.site ? text(f.site) : "null"}`);
  }
  s.severity = e.severity.includes(f.severity);
  s.inventedSeverity = e.severity.length === 1 && e.severity[0] === null && f.severity !== null;
  if (!s.severity) misses.push(`severity: expected ${e.severity.join("/")}, got ${f.severity}`);
  if (e.nocturnal !== undefined) {
    s.nocturnal = f.nocturnal === e.nocturnal;
    if (!s.nocturnal) misses.push(`nocturnal: got ${f.nocturnal}`);
  }

  for (const t of e.treatments) {
    const hit = f.treatments.find((x) => rx(t.name).test(x.name));
    if (!hit) misses.push(`treatment missed: ${t.name}`);
    else {
      s.tx.found++;
      if (t.efficacy.includes(hit.efficacy)) s.tx.efficacyRight++;
      else misses.push(`efficacy ${hit.name}: expected ${t.efficacy.join("/")}, got ${hit.efficacy}`);
    }
  }
  const extraTx = f.treatments.filter((x) => !e.treatments.some((t) => rx(t.name).test(x.name)));
  s.tx.extra = extraTx.length;
  for (const x of extraTx) misses.push(`treatment invented: ${x.name}`);

  // Associated symptoms and functional impact are pooled: where a model files
  // "woken by pain" matters less than whether it captured it at all.
  const want = [...e.associated, ...e.functional];
  const pooled = matchTerms(want, [...f.associated, ...f.functional], ok);
  s.terms = { expected: want.length, found: pooled.found.length, extra: pooled.extras.length };
  for (const w of want.filter((x) => !pooled.found.includes(x))) misses.push(`missed: /${w}/`);
  for (const x of pooled.extras) misses.push(`extra term: ${x.clinical}`);

  const neg = matchTerms(e.negatives, f.negatives, ok);
  s.negatives = { expected: e.negatives.length, found: neg.found.length, extra: neg.extras.length };
  for (const w of e.negatives.filter((x) => !neg.found.includes(x))) misses.push(`negative missed: /${w}/`);
  for (const x of neg.extras) misses.push(`negative invented: ${x.clinical}`);

  // A follow-up is optional, but if present it must be a descriptive question.
  s.followUpOk = !r.followUp || (!/\bwhy\b/i.test(r.followUp.question) && r.followUp.options.length >= 2);
  return s;
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%`.padStart(4) : "  – ");

async function main() {
  const make = extractors[engine];
  if (!make) throw new Error(`unknown engine "${engine}" (use rules, claude or local)`);
  const extract = make();
  const results: Score[] = [];
  for (const c of CASES) {
    const t0 = Date.now();
    try {
      const r = await extract(c.note);
      results.push(score(c, r, Date.now() - t0));
    } catch (err) {
      results.push({ id: c.id, ok: false, error: (err as Error).message, ms: Date.now() - t0, tx: { expected: 0, found: 0, efficacyRight: 0, extra: 0 }, terms: { expected: 0, found: 0, extra: 0 }, negatives: { expected: 0, found: 0, extra: 0 }, misses: [] });
    }
  }

  const done = results.filter((r) => r.ok);
  const count = (k: "complaint" | "site" | "severity" | "nocturnal" | "followUpOk") => [done.filter((r) => r[k] === true).length, done.filter((r) => r[k] !== undefined).length] as const;
  const sum = (f: (r: Score) => number) => done.reduce((a, r) => a + f(r), 0);
  const label = engine === "local" ? `local:${flag("model") ?? "gemma3n:e4b"}` : engine;

  console.log(`\nExtraction eval: ${label} · ${CASES.length} held-out notes\n`);
  const rows: [string, string][] = [
    ["Valid output", pct(done.length, results.length)],
    ["Complaint correct", pct(...count("complaint"))],
    ["Site correct", pct(...count("site"))],
    ["Severity correct", pct(...count("severity"))],
    ["Severity invented when none stated", `${sum((r) => (r.inventedSeverity ? 1 : 0))} notes`],
    ["Night-time onset correct", pct(...count("nocturnal"))],
    ["Treatments found (recall)", pct(sum((r) => r.tx.found), sum((r) => r.tx.expected))],
    ["Treatment effect right (of found)", pct(sum((r) => r.tx.efficacyRight), sum((r) => r.tx.found))],
    ["Treatments invented", `${sum((r) => r.tx.extra)}`],
    ["Symptoms + impact found (recall)", pct(sum((r) => r.terms.found), sum((r) => r.terms.expected))],
    ["Symptoms + impact unsupported", `${sum((r) => r.terms.extra)}`],
    ["Pertinent negatives found", pct(sum((r) => r.negatives.found), sum((r) => r.negatives.expected))],
    ["Negatives invented", `${sum((r) => r.negatives.extra)}`],
    ["Follow-up question acceptable", pct(...count("followUpOk"))],
    ["Median latency", `${[...results.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(results.length / 2)]} ms`],
  ];
  for (const [k, v] of rows) console.log(`  ${k.padEnd(38)} ${v}`);

  if (verbose || results.some((r) => !r.ok)) {
    console.log("\nPer note:");
    for (const r of results) {
      if (!r.ok) console.log(`  ✗ ${r.id}: ${r.error}`);
      else if (r.misses.length) console.log(`  · ${r.id}: ${r.misses.join("; ")}`);
      else if (verbose) console.log(`  ✓ ${r.id}`);
    }
  }

  const rf = RED_FLAG_CASES.map((c) => ({ ...c, got: !!screenRedFlags(c.note) }));
  const should = rf.filter((c) => c.flag);
  const shouldNot = rf.filter((c) => !c.flag);
  console.log(`\nRed-flag rules (always deterministic, whatever the engine)`);
  console.log(`  ${"Emergencies caught".padEnd(38)} ${should.filter((c) => c.got).length}/${should.length}`);
  console.log(`  ${"False alarms".padEnd(38)} ${shouldNot.filter((c) => c.got).length}/${shouldNot.length}`);
  for (const c of rf.filter((x) => x.got !== x.flag)) console.log(`  ${c.flag ? "MISSED" : "FALSE ALARM"}: "${c.note}" (${c.why})`);
  for (const n of URGENT_CARE_CASES) console.log(`  urgent-care (not scored): ${screenRedFlags(n) ? "flagged" : "not flagged"}: "${n}"`);

  const out = flag("out");
  if (out) writeFileSync(out, JSON.stringify({ engine: label, results, redFlags: rf }, null, 2));
}

void main();
