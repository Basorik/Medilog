import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { priceUsage, type Efficacy, type ExtractionResult, type SlotKey, type Usage } from "@medilog/engine";

// The two cloud calls. Both are stateless: the server keeps nothing, logs no
// bodies, and only ever sees PII-scrubbed text or aggregate statistics.

// Which service runs Claude. "bedrock" keeps inference in Australia via the
// Bedrock "au" cross-region profile (Sydney + Melbourne) and authenticates
// with the AWS credential chain (an IAM role on Lambda), so no API key exists.
export type Provider = "anthropic" | "bedrock";
export const PROVIDER: Provider = process.env.MEDILOG_PROVIDER === "bedrock" ? "bedrock" : "anthropic";
const AWS_REGION = process.env.AWS_REGION ?? "ap-southeast-2";

const DEFAULT_MODELS: Record<Provider, { extract: string; report: string }> = {
  anthropic: { extract: "claude-haiku-5-5", report: "claude-sonnet-5-5" },
  bedrock: { extract: "au.anthropic.claude-haiku-5-5", report: "au.anthropic.claude-sonnet-5-5" },
};

export const MODELS = {
  extract: process.env.MEDILOG_EXTRACT_MODEL ?? DEFAULT_MODELS[PROVIDER].extract,
  report: process.env.MEDILOG_REPORT_MODEL ?? DEFAULT_MODELS[PROVIDER].report,
};

/** Plain-language description of where notes are processed, shown to users before they opt in. */
export const PROCESSOR =
  PROVIDER === "bedrock"
    ? MODELS.extract.startsWith("au.")
      ? "Amazon Bedrock in Australia"
      : `Amazon Bedrock (${AWS_REGION})`
    : "Anthropic's Claude API (outside Australia)";

/** Whether the relay has what it needs to call a model. Bedrock credentials come from the AWS chain at call time. */
export const aiConfigured = () =>
  PROVIDER === "bedrock" || Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// Created on first use, so tools that only need the prompt and schema (the
// eval harness) can import this module without credentials.
let anthropic: Anthropic | null = null;
let bedrock: AnthropicBedrock | null = null;
const CLIENT_OPTS = { maxRetries: 1, timeout: 60_000 };
const client = (): { messages: Pick<Anthropic["messages"], "parse"> } =>
  PROVIDER === "bedrock"
    ? (bedrock ??= new AnthropicBedrock({ awsRegion: AWS_REGION, ...CLIENT_OPTS }))
    : (anthropic ??= new Anthropic(CLIENT_OPTS));

// ---------------------------------------------------------------- schemas

const Term = z.object({ patient: z.string(), clinical: z.string() });
// Enums are kept as described strings and normalised after parsing, so one
// off-vocabulary word degrades a single field instead of failing the call.
const EFFICACY = ["helped", "partial", "none", "unknown"] as const;
const SLOTS = ["site", "onset", "character", "radiation", "associated", "timing", "modifiers", "severity", "function", "relief", "negatives"] as const;
const Efficacy = z.string().describe(`One of: ${EFFICACY.join(", ")}`);
const Slot = z.string().describe(`One of: ${SLOTS.join(", ")}`);

const Fields = z.object({
  complaint: Term.nullable(),
  site: Term.nullable(),
  character: z.array(Term),
  radiation: Term.nullable(),
  onset: Term.nullable(),
  onsetTime: z.string().nullable().describe('24-hour "HH:MM" if the patient stated a clock time, else null'),
  nocturnal: z.boolean(),
  duration: Term.nullable(),
  severity: z.number().nullable(),
  associated: z.array(Term),
  negatives: z.array(Term),
  exacerbating: z.array(Term),
  relieving: z.array(Term),
  treatments: z.array(z.object({ name: z.string(), dose: z.string().nullable(), efficacy: Efficacy })),
  functional: z.array(Term),
  cycle: Term.nullable(),
});

const Patch = z.object({
  treatmentEfficacy: Efficacy.nullable(),
  addAssociated: z.array(Term),
  addNegatives: z.array(Term),
  severity: z.number().nullable(),
  addFunctional: z.array(Term),
  duration: Term.nullable(),
  site: Term.nullable(),
});

export const Extraction = z.object({
  fields: Fields,
  followUp: z
    .object({
      question: z.string(),
      targets: z.array(Slot),
      options: z.array(z.object({ label: z.string(), patch: Patch })),
    })
    .nullable(),
});

const ReportProse = z.object({
  soapbox: z.array(z.string()),
  chiefComplaint: z.string(),
  sections: z.array(z.object({ title: z.string(), lines: z.array(z.string()) })),
});

// ---------------------------------------------------------------- prompts

export const EXTRACT_SYSTEM = `You are the intake scribe inside Medilog, a patient-owned symptom journal. A patient has just dictated a short note about a symptom episode, often while unwell or half-asleep. Turn it into a structured clinical history and choose one follow-up question.

Translate, don't diagnose. Record only what the patient said. Never name a condition, suggest a cause, give advice, or triage. This keeps the product a communication tool rather than a medical device, and it is what makes clinicians trust the output.

Every concept is a pair: "patient" is the patient's own plain words (at most 4 words, sentence case) and "clinical" is concise clinician vocabulary or shorthand (for example "RLQ / right pelvis", "Dyschezia", "Woken from sleep ~03:00", "Radiates → R thigh").

Field rules:
- Use only what the note states, plus the prior-log line when the note clearly continues the same symptom. Leave fields null or empty when not stated.
- severity is an integer 0–10. Only infer it from words when they are unambiguous ("worst ever" = 9, "really bad" = 8).
- nocturnal is true when the patient was woken by the symptom or it began between 00:00 and 05:59.
- negatives are symptoms the patient explicitly says were absent.
- treatments: efficacy is "unknown" unless the note says how well it worked.
- To keep months of logs comparable, use these exact clinical strings when they apply: complaint "Lower abdominal / pelvic pain", "Abdominal pain", "Headache", "Arthralgia", "Back pain", "Chest discomfort", "Fatigue" or "Rash"; functional "Absent from work" and "Sleep disturbance (woken by pain)"; cycle "Menses day 1", "Menstruating", "Premenstrual" or "Mid-cycle"; negatives and associated "Fever / chills" and "Nausea".

Follow-up question: pick the single most useful missing detail, in this priority order: (1) whether the treatments helped, together with pertinent negatives if none are recorded; (2) severity; (3) exact site; (4) associated symptoms or pertinent negatives; (5) impact on daily activities; (6) duration. Ask about where, when, how much and what helped, never why. Start with "Logged." and keep it under 20 words, in warm plain language. Give 3–5 tappable options of at most 5 words each; each option's patch records exactly what that answer adds, with every unaffected patch field null or empty. If nothing important is missing, followUp is null.`;

const REPORT_SYSTEM = `You prepare a patient for a GP or specialist appointment from their own symptom logs. You receive aggregate facts as JSON, already computed from the logs. Write two things.

1. "soapbox": 3–4 first-person sentences the patient will read aloud in the first 60 seconds of the visit to set the agenda with confidence. Lead with frequency and timeframe, then severity and pattern, then what has not helped and the impact on work and sleep, and end with what they want from the visit. Plain, assertive and specific, with no hedging and no apology.

2. A one-page history of presenting illness for the clinician, in concise ward-round shorthand. "chiefComplaint" is one line. "sections" use these titles, in this order, omitting any section without data: "Onset & course", "Site · character · timing", "Associated symptoms", "Pertinent negatives (recorded at time of episode)", "Treatments tried", "Functional impact (ADLs)". Each line is at most 20 words.

Use only numbers, dates and counts present in the facts; never derive new statistics. Write as "n/N" where the facts give a count and a total. Do not diagnose, speculate about causes, list differentials, or recommend investigations or treatment, and avoid words like "likely", "consistent with" or "suggestive of": the clinician draws the conclusions. The patient's quoted words are handled separately, so do not include them. Use Australian English.`;

// ---------------------------------------------------------------- calls

// Bedrock IDs look like "au.anthropic.claude-haiku-5-5". Geographic profiles
// (au, us, eu, jp) cost 10% more than the global rate.
const GEO_PROFILE = /^(au|us|eu|jp|apac)\./;
function toUsage(model: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): Usage {
  const base = model.replace(/^(au|us|eu|jp|apac|global)\./, "").replace(/^anthropic\./, "");
  const usage = priceUsage(base, u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), u.output_tokens);
  return { ...usage, model, costUsd: usage.costUsd * (GEO_PROFILE.test(model) ? 1.1 : 1) };
}

/** The model declined (a safeguard refusal) or returned nothing usable. `category` is the refusal category, never content. */
export class ModelDeclined extends Error {
  constructor(
    message: string,
    readonly category: string | null,
  ) {
    super(message);
  }
}

const declined = (what: string, r: { stop_reason: string | null; stop_details?: { category?: string | null } | null }) =>
  new ModelDeclined(`${what} stopped: ${r.stop_reason}`, r.stop_reason === "refusal" ? (r.stop_details?.category ?? "uncategorised") : null);

const efficacy = (e: string | null): Efficacy | null => (e === null ? null : (EFFICACY as readonly string[]).includes(e) ? (e as Efficacy) : "unknown");
const severity = (n: number | null) => (n === null ? null : Math.max(0, Math.min(10, Math.round(n))));

export function normaliseExtraction(x: z.infer<typeof Extraction>): ExtractionResult {
  return {
    fields: {
      ...x.fields,
      severity: severity(x.fields.severity),
      treatments: x.fields.treatments.map((t) => ({ ...t, efficacy: efficacy(t.efficacy)! })),
    },
    followUp: x.followUp && {
      question: x.followUp.question,
      targets: x.followUp.targets.filter((s): s is SlotKey => (SLOTS as readonly string[]).includes(s)),
      options: x.followUp.options.slice(0, 5).map((o) => ({
        label: o.label,
        patch: { ...o.patch, treatmentEfficacy: efficacy(o.patch.treatmentEfficacy), severity: severity(o.patch.severity) },
      })),
    },
  };
}

export const extractionUserMessage = (input: { text: string; loggedAt: string; prior: string | null }) =>
  `Logged at: ${input.loggedAt}\nPrior log: ${input.prior ?? "none"}\n\n<note>\n${input.text}\n</note>`;

export async function extractWithClaude(input: { text: string; loggedAt: string; prior: string | null }) {
  const response = await client().messages.parse(
    {
      model: MODELS.extract,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Extraction) },
      system: EXTRACT_SYSTEM,
      messages: [
        {
          role: "user",
          content: extractionUserMessage(input),
        },
      ],
    },
    { timeout: 25_000 },
  );
  if (response.stop_reason === "refusal" || !response.parsed_output) throw declined("extraction", response);
  return { result: normaliseExtraction(response.parsed_output), usage: toUsage(MODELS.extract, response.usage) };
}

export async function reportWithClaude(facts: unknown) {
  const request = {
    model: MODELS.report,
    max_tokens: 8000,
    system: REPORT_SYSTEM,
    messages: [{ role: "user" as const, content: `<facts>\n${JSON.stringify(facts, null, 1)}\n</facts>` }],
  };
  if (PROVIDER === "bedrock") {
    // Bedrock has no server-side fallback; a decline drops the app back to its template.
    const response = await client().messages.parse({ ...request, output_config: { effort: "medium", format: zodOutputFormat(ReportProse) } });
    if (response.stop_reason === "refusal" || !response.parsed_output) throw declined("report", response);
    return { prose: response.parsed_output, usage: toUsage(MODELS.report, response.usage) };
  }
  // Server-side fallbacks re-run a declined request on another model inside the same call.
  const response = await (anthropic ??= new Anthropic(CLIENT_OPTS)).beta.messages.parse({
    model: MODELS.report,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ReportProse) },
    system: REPORT_SYSTEM,
    messages: [{ role: "user", content: `<facts>\n${JSON.stringify(facts, null, 1)}\n</facts>` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw declined("report", response);
  return { prose: response.parsed_output, usage: toUsage(MODELS.report, response.usage) };
}
