import {
  ASSOCIATED,
  CHARACTER,
  CYCLE,
  EFFICACY_HELPED,
  EFFICACY_NONE,
  EFFICACY_PARTIAL,
  FUNCTIONAL,
  NUMBER_WORDS,
  TREATMENTS,
} from "./lexicon";
import {
  cloneFields,
  emptyFields,
  emptyPatch,
  type AnswerPatch,
  type Efficacy,
  type ExtractionResult,
  type FollowUp,
  type HpiFields,
  type SlotKey,
  type Term,
  type Treatment,
} from "./types";

// On-device extraction engine. Deterministic, instant and free: it is the
// offline fallback for the cloud model and the reference behaviour the
// cloud prompt is held to. It maps a free-text note onto the SOCRATES schema
// and picks the single highest-yield follow-up question.

export type Region = "pelvic" | "abdomen" | "head" | "joints" | "back" | "chest" | "other";

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Split into clauses so negation and efficacy only apply locally. */
const clauses = (text: string) =>
  text
    .split(/[.;!?]|,|\bbut\b|\bthen\b/)
    .map((c) => c.trim())
    .filter(Boolean);

const NEGATOR = /\b(no|not|without|denies|didn'?t|never|wasn'?t|isn'?t|haven'?t|hasn'?t|nor)\b/;

function isNegated(clause: string, index: number): boolean {
  const before = clause.slice(0, index).trim().split(" ").slice(-4).join(" ");
  return NEGATOR.test(before);
}

export const addTerm = (list: Term[], term: Term): Term[] =>
  list.some((x) => x.clinical.toLowerCase() === term.clinical.toLowerCase()) ? list : [...list, term];

const removeTerm = (list: Term[], term: Term): Term[] =>
  list.filter((x) => x.clinical.toLowerCase() !== term.clinical.toLowerCase());

// ---------------------------------------------------------------- site

const JOINT_WORDS = "knees?|wrists?|hands?|fingers?|knuckles?|ankles?|hips?|shoulders?|elbows?|joints?|toes?";
const JOINT_RE = new RegExp(`\\b(${JOINT_WORDS})\\b`);
const JOINT_RE_ALL = new RegExp(`\\b(${JOINT_WORDS})\\b`, "g");

function detectLaterality(text: string): "right" | "left" | "both" | null {
  if (/\bboth (sides|knees|wrists|hands|hips|ankles|shoulders)|bilateral/.test(text)) return "both";
  const side = (w: string) =>
    new RegExp(
      `\\b${w}[- ]sided\\b|\\b${w}( hand)?( lower| upper)? (side|pelvi\\w*|abdom\\w*|belly|tummy|ovary|groin|hip|knee|wrist|hand|shoulder|temple|eye|ankle|foot)|(on|in) (my|the) (lower )?${w}\\b|(lower|upper) ${w}\\b|low on (my|the) ${w}\\b`,
    ).test(text);
  if (side("right")) return "right";
  if (side("left")) return "left";
  return null;
}

function detectRegion(text: string): Region | null {
  if (/\b(migraine|headache|head|temples?|forehead|behind (my|the) (right |left )?eyes?)\b/.test(text)) return "head";
  if (/\bpelvi[cs]|\bovar(y|ies)\b|\bgroin\b|\buterus\b|\bwomb\b|lower (belly|abdomen|abdominal|tummy|stomach)|(lower|low on my) (right |left )?(side|abdomen|belly)|(right|left) lower (abdomen|side|belly)/.test(text))
    return "pelvic";
  if (/\b(belly|abdomen|abdominal|tummy|stomach)\b/.test(text)) return "abdomen";
  if (JOINT_RE.test(text)) return "joints";
  if (/\bback\b/.test(text) && !/\bback (to|home|at)\b/.test(text)) return "back";
  if (/\bchest\b/.test(text)) return "chest";
  if (/\bcramp\w*|\bperiod\b/.test(text)) return "pelvic";
  return null;
}

function siteTerm(text: string, region: Region | null): Term | null {
  const lat = detectLaterality(text);
  const L = lat === "right" ? "R" : lat === "left" ? "L" : lat === "both" ? "Bilateral" : "";
  switch (region) {
    case "pelvic":
      if (lat === "right") return { patient: "Lower right side", clinical: "RLQ / right pelvis" };
      if (lat === "left") return { patient: "Lower left side", clinical: "LLQ / left pelvis" };
      if (/pelvi|lower (belly|abdomen|abdominal|tummy|stomach)|\bovar|\bgroin|\buterus|\bwomb/.test(text))
        return { patient: "Lower belly", clinical: "Suprapubic / pelvis" };
      return null;
    case "abdomen":
      if (/\bupper\b/.test(text)) return { patient: "Upper belly", clinical: "Epigastric / upper abdomen" };
      return { patient: lat ? `${lat[0].toUpperCase()}${lat.slice(1)} side of belly` : "Belly", clinical: L ? `${L} abdomen` : "Abdomen" };
    case "head":
      if (/behind (my|the) (right |left )?eyes?/.test(text)) return { patient: "Behind the eye", clinical: `${L ? L + " " : ""}Retro-orbital` };
      if (/temples?/.test(text)) return { patient: "Temples", clinical: `${L ? L + " " : ""}Temporal` };
      if (lat === "right" || lat === "left") return { patient: `${lat === "right" ? "Right" : "Left"} side of head`, clinical: `${L} hemicranial` };
      return { patient: "Head", clinical: "Head (non-localised)" };
    case "joints": {
      const joints = Array.from(new Set(Array.from(text.matchAll(JOINT_RE_ALL), (m) => m[1])));
      const list = joints.join(", ");
      const cap = list[0].toUpperCase() + list.slice(1);
      return { patient: cap, clinical: L ? `${L} ${list}` : cap };
    }
    case "back":
      return /lower back/.test(text) ? { patient: "Lower back", clinical: "Lumbar" } : { patient: "Back", clinical: "Back" };
    case "chest":
      return { patient: "Chest", clinical: "Chest" };
    default:
      return null;
  }
}

const COMPLAINTS: Record<Region, Term> = {
  pelvic: { patient: "Pelvic pain", clinical: "Lower abdominal / pelvic pain" },
  abdomen: { patient: "Belly pain", clinical: "Abdominal pain" },
  head: { patient: "Headache", clinical: "Headache" },
  joints: { patient: "Joint pain", clinical: "Arthralgia" },
  back: { patient: "Back pain", clinical: "Back pain" },
  chest: { patient: "Chest discomfort", clinical: "Chest discomfort" },
  other: { patient: "Feeling unwell", clinical: "Non-specific symptoms" },
};

// ---------------------------------------------------------------- timing & severity

function parseTime(text: string, createdAt: Date): { hour: number; minute: number } | null {
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)/);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3].startsWith("p")) hour += 12;
    return { hour, minute: Number(ampm[2] ?? 0) };
  }
  const at = text.match(/\b(?:at|around|about|up at|by)\s(\d{1,2})(?::(\d{2}))?\b(?!\s?(\/|out of|on|tablets|ibuprofen))/);
  if (at) {
    let hour = Number(at[1]);
    if (hour > 23) return null;
    // "woke at 3" means 3 AM; otherwise assume the nearest past occurrence.
    if (hour <= 12 && /\bwok|\bwak|\bup at/.test(text)) hour = hour === 12 ? 0 : hour;
    else if (hour < 12 && createdAt.getHours() >= 12 && hour + 12 <= createdAt.getHours()) hour += 12;
    return { hour, minute: Number(at[2] ?? 0) };
  }
  return null;
}

const fmtClock = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const fmtSpoken = (h: number, m: number) => {
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
};

function parseOnset(text: string, createdAt: Date): { onset: Term | null; onsetTime: string | null; nocturnal: boolean } {
  const woke = /\b(woke|waking|woken|wakes)\b|\bup at \d/.test(text);
  const time = parseTime(text, createdAt) ?? (woke && createdAt.getHours() < 7 ? { hour: createdAt.getHours(), minute: createdAt.getMinutes() } : null);
  if (time) {
    const nocturnal = time.hour < 6 || (woke && time.hour < 7);
    const onsetTime = fmtClock(time.hour, time.minute);
    if (woke)
      return {
        onset: { patient: `Woke me at ${fmtSpoken(time.hour, time.minute)}`, clinical: `Woken from sleep ~${onsetTime}` },
        onsetTime,
        nocturnal,
      };
    return { onset: { patient: `Started ${fmtSpoken(time.hour, time.minute)}`, clinical: `Onset ~${onsetTime}` }, onsetTime, nocturnal };
  }
  const none = { onsetTime: null, nocturnal: false };
  if (woke) return { ...none, onset: { patient: "Woke me up", clinical: "Woken from sleep" }, nocturnal: true };
  if (/this morning/.test(text)) return { ...none, onset: { patient: "This morning", clinical: "Morning onset" } };
  if (/\btonight\b|this evening/.test(text)) return { ...none, onset: { patient: "This evening", clinical: "Evening onset" } };
  const since = text.match(/\bsince (yesterday|last night|this morning|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunch)/);
  if (since) return { ...none, onset: { patient: `Since ${since[1]}`, clinical: `Onset ${since[1]}` } };
  return { ...none, onset: null };
}

function parseDuration(text: string): Term | null {
  if (/\ball day\b|whole day/.test(text)) return { patient: "All day", clinical: "Persistent through the day" };
  if (/\ball night\b/.test(text)) return { patient: "All night", clinical: "Persistent overnight" };
  const m = text.match(/\b(?:for|lasted|lasting)(?: about| around)? (\d+|an?|a couple of|a few|one|two|three|four|five|six) (hours?|hrs?|minutes?|mins?|days?)/);
  const took = text.match(/\btook (?:over |about |nearly )?(an?|\d+|a couple of|two|three) (hours?|minutes?|mins?) to (loosen up|loosen|settle|ease|wear off|go away)/);
  if (took) return { patient: took[0].replace(/^took /, ""), clinical: `~${took[1].startsWith("a") ? "1" : NUMBER_WORDS[took[1]] ?? took[1]}${took[2].startsWith("h") ? "h" : "min"}+` };
  if (m) {
    const qty = m[1] === "a" || m[1] === "an" ? "1" : m[1] === "a couple of" ? "2" : m[1] === "a few" ? "~3" : String(NUMBER_WORDS[m[1]] ?? m[1]);
    const unit = m[2].startsWith("h") ? "h" : m[2].startsWith("m") ? "min" : "d";
    return { patient: `${m[0].replace(/^(for|lasted|lasting) /, "")}`, clinical: `~${qty.replace("~", "")}${unit}` };
  }
  if (/still (going|there|hurting|aching)|hasn'?t (stopped|gone)/.test(text)) return { patient: "Still going", clinical: "Ongoing at time of log" };
  return null;
}

function parseSeverity(text: string): number | null {
  const ratio = text.match(/\b(\d{1,2})(?:\.\d)?\s?(?:\/|out of)\s?10\b/);
  if (ratio) return Math.min(10, Number(ratio[1]));
  const approx = text.match(/\b(?:about|maybe|like|around|probably|solid|easily|at least|is|was|it's|at)\san?\s(\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten)\b(?!\s?(am|pm|hours?|mins?|minutes?|days?|tablets|ibuprofen|o'?clock))/);
  if (approx) {
    const n = NUMBER_WORDS[approx[1]] ?? Number(approx[1]);
    if (n <= 10) return n;
  }
  if (/worst (it'?s|it has) (ever )?been|worst (pain )?ever|excruciating|unbearable|\bagony\b/.test(text)) return 9;
  if (/really bad|\bsevere\b|\bawful\b|\bterrible\b|\bhorrendous\b/.test(text)) return 8;
  if (/\bmoderate\b/.test(text)) return 5;
  if (/\bmild\b|\bslight\b|niggl/.test(text)) return 3;
  return null;
}

function parseRadiation(text: string): Term | null {
  const m = text.match(/\b(?:radiat\w*|spread\w*|shoot\w*|going|goes|moving|travel\w*)\s(?:down|into|to|up|through|round)\s(?:my\s|the\s)?(?:(right|left)\s)?(thigh|leg|back|hip|groin|buttock|bum|arm|neck|shoulder|jaw|vagina|rectum)/);
  if (!m) return null;
  const side = m[1] ? `${m[1]} ` : "";
  const sideAbbr = m[1] === "right" ? "R " : m[1] === "left" ? "L " : "";
  return { patient: `Spreads to ${side}${m[2]}`, clinical: `Radiates → ${sideAbbr}${m[2]}` };
}

const GERUNDS: Record<string, string> = {
  walk: "walking", move: "movement", sit: "sitting", stand: "standing", eat: "eating", bend: "bending",
  lie: "lying", cough: "coughing", drive: "driving", run: "running", exercise: "exercise", lift: "lifting",
};
const gerund = (phrase: string) => {
  const [first, ...rest] = phrase.split(" ");
  return [GERUNDS[first] ?? first, ...rest].join(" ");
};

function parseModifiers(text: string): { exacerbating: Term[]; relieving: Term[] } {
  const exacerbating: Term[] = [];
  const relieving: Term[] = [];
  for (const m of text.matchAll(/\b(?:worse|hurts more|worst)\s(?:when|with|if|after|on)\s(?:i\s)?([a-z' ]{3,30}?)(?=[,.;!]|$| and | but )/g)) {
    if (/toilet|pee|wee|sex/.test(m[1])) continue;
    exacerbating.push({ patient: `Worse ${m[0].split(" ").slice(1).join(" ")}`, clinical: `Aggravated by ${gerund(m[1])}` });
  }
  for (const m of text.matchAll(/\b(?:better|eases|eased|easier)\s(?:when|with|if|after|once)\s(?:i\s)?([a-z' ]{3,30}?)(?=[,.;!]|$| and | but )/g)) {
    relieving.push({ patient: `Better ${m[0].split(" ").slice(1).join(" ")}`, clinical: `Relieved by ${gerund(m[1])}` });
  }
  return { exacerbating, relieving };
}

function efficacyIn(clause: string): Efficacy | null {
  if (EFFICACY_NONE.test(clause)) return "none";
  if (EFFICACY_PARTIAL.test(clause)) return "partial";
  if (EFFICACY_HELPED.test(clause)) return "helped";
  return null;
}

function parseTreatments(text: string): Treatment[] {
  const found: Treatment[] = [];
  let lastMentioned: Treatment[] = [];
  for (const clause of clauses(text)) {
    const here: Treatment[] = [];
    for (const lex of TREATMENTS) {
      const m = clause.match(lex.re);
      if (!m || isNegated(clause, m.index ?? 0)) continue;
      let tx = found.find((f) => f.name === lex.name);
      if (!tx) {
        const dose = clause.match(new RegExp(`\\b(\\d+|one|two|three|four)\\s(?:x\\s)?(?:tablets? of\\s|of\\s|of the\\s)?${m[0]}`));
        const mg = clause.match(/\b(\d{2,4})\s?mg\b/);
        tx = {
          name: lex.name,
          dose: mg ? `${mg[1]} mg` : dose ? `×${NUMBER_WORDS[dose[1]] ?? dose[1]}` : null,
          efficacy: "unknown",
        };
        found.push(tx);
      }
      here.push(tx);
    }
    const eff = efficacyIn(clause);
    const targets = here.length ? here : lastMentioned;
    if (eff) for (const tx of targets) tx.efficacy = eff;
    if (here.length) lastMentioned = here;
  }
  return found;
}

function scanTerms(text: string, lex: { re: RegExp; term: Term }[]) {
  let present: Term[] = [];
  let negated: Term[] = [];
  for (const clause of clauses(text)) {
    for (const { re, term } of lex) {
      const m = clause.match(re);
      if (!m) continue;
      if (isNegated(clause, m.index ?? 0)) negated = addTerm(negated, term);
      else present = addTerm(present, term);
    }
  }
  return { present, negated };
}

// ---------------------------------------------------------------- public API

/** The previous log, so "pain eased a bit" is understood as the same pain. */
export interface PriorContext {
  region: Region;
  site: Term | null;
}

export function extractFields(
  raw: string,
  createdAt: Date = new Date(),
  prior?: PriorContext,
): { fields: HpiFields; region: Region } {
  const text = normalise(raw);
  const fields = emptyFields();

  let region = detectRegion(text);
  fields.site = siteTerm(text, region);
  if (!region && prior && /\b(pain|ache|aching|hurt\w*|cramp\w*|sore)\b/.test(text)) {
    region = prior.region;
    fields.site = prior.site;
  }

  const assoc = scanTerms(text, ASSOCIATED);
  fields.associated = assoc.present;
  fields.negatives = assoc.negated;
  // A headache logged as the main complaint isn't also an associated symptom.
  if (region === "head") fields.associated = removeTerm(fields.associated, { patient: "", clinical: "Headache" });

  fields.character = scanTerms(text, CHARACTER).present;
  const { onset, onsetTime, nocturnal } = parseOnset(text, createdAt);
  fields.onset = onset;
  fields.onsetTime = onsetTime;
  fields.nocturnal = nocturnal;
  fields.duration = parseDuration(text);
  fields.severity = parseSeverity(text);
  fields.radiation = parseRadiation(text);
  Object.assign(fields, parseModifiers(text));
  fields.treatments = parseTreatments(text);
  fields.functional = scanTerms(text, FUNCTIONAL).present;
  fields.cycle = CYCLE.find((c) => c.re.test(text))?.term ?? null;

  if (!region) {
    if (fields.associated.some((a) => a.clinical === "Rash")) {
      region = "other";
      fields.complaint = { patient: "Rash", clinical: "Rash" };
    } else if (fields.associated.some((a) => a.clinical === "Fatigue")) {
      region = "other";
      fields.complaint = { patient: "Exhaustion", clinical: "Fatigue" };
    } else region = "other";
  }
  fields.complaint ??= /\bmigraine/.test(text) ? { patient: "Migraine", clinical: "Headache" } : COMPLAINTS[region];
  if (fields.complaint.clinical === "Fatigue") fields.associated = removeTerm(fields.associated, fields.complaint);
  if (fields.complaint.clinical === "Rash") fields.associated = removeTerm(fields.associated, fields.complaint);
  return { fields, region };
}

/** Which parts of the clinical schema this entry already covers. */
export function coverage(f: HpiFields): Record<SlotKey, boolean> {
  return {
    site: !!f.site,
    onset: !!f.onset,
    character: f.character.length > 0,
    radiation: !!f.radiation,
    associated: f.associated.length > 0 || f.negatives.length > 0,
    timing: !!f.duration || !!f.onset,
    modifiers: f.exacerbating.length + f.relieving.length > 0,
    severity: f.severity !== null,
    function: f.functional.length > 0,
    relief: f.treatments.length > 0 && f.treatments.every((t) => t.efficacy !== "unknown"),
    negatives: f.negatives.length > 0,
  };
}

const patch = (p: Partial<AnswerPatch>): AnswerPatch => ({ ...emptyPatch(), ...p });
const term = (patient: string, clinical = patient): Term => ({ patient, clinical });

const NEG_SETS: Record<Region, Term[]> = {
  pelvic: [term("Fever", "Fever / chills"), term("Nausea")],
  abdomen: [term("Fever", "Fever / chills"), term("Vomiting")],
  head: [term("Visual aura"), term("Vomiting")],
  joints: [term("Swelling"), term("Fever", "Fever / chills")],
  back: [term("Fever", "Fever / chills"), term("Leg numbness", "Lower-limb paraesthesia")],
  chest: [term("Short of breath", "Dyspnoea"), term("Dizziness", "Light-headedness")],
  other: [term("Fever", "Fever / chills"), term("Nausea")],
};

const joinNames = (names: string[]) =>
  names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * Pick the single highest-yield missing detail and phrase it as one
 * descriptive question with tap-to-answer pills. Never asks "why".
 */
export function nextQuestion(f: HpiFields, region: Region): FollowUp | null {
  const cov = coverage(f);
  const negSet = NEG_SETS[region].filter(
    (n) => !f.negatives.some((x) => x.clinical === n.clinical) && !f.associated.some((x) => x.clinical === n.clinical),
  );
  const negWords = negSet.map((n) => n.patient.toLowerCase());

  if (f.treatments.length && !cov.relief) {
    const names = f.treatments.filter((t) => t.efficacy === "unknown").map((t) => t.name.toLowerCase());
    const negQ = negWords.length ? `, and did you have any ${negWords.join(" or ")}` : "";
    const negLabel = negWords.length ? ` · no ${negWords.join("/")}` : "";
    return {
      question: `Logged. Did the ${joinNames(names)} help${negQ}?`,
      targets: negWords.length ? ["relief", "negatives"] : ["relief"],
      options: [
        { label: `Helped a lot${negLabel}`, patch: patch({ treatmentEfficacy: "helped", addNegatives: negSet }) },
        { label: "Barely helped", patch: patch({ treatmentEfficacy: "partial", addNegatives: negSet }) },
        { label: "Didn't help at all", patch: patch({ treatmentEfficacy: "none", addNegatives: negSet }) },
        ...negSet.map((n) => ({ label: `Had ${n.patient.toLowerCase()}`, patch: patch({ addAssociated: [n] }) })),
      ],
    };
  }
  if (!cov.severity) {
    return {
      question: "Logged. At its worst, how bad was it?",
      targets: ["severity"],
      options: [
        { label: "Mild · 2/10", patch: patch({ severity: 2 }) },
        { label: "Moderate · 5/10", patch: patch({ severity: 5 }) },
        { label: "Severe · 7/10", patch: patch({ severity: 7 }) },
        { label: "Worst ever · 9/10", patch: patch({ severity: 9 }) },
      ],
    };
  }
  if (!cov.site && (region === "pelvic" || region === "abdomen" || region === "other")) {
    return {
      question: "Logged. Where exactly is it?",
      targets: ["site"],
      options: [
        { label: "Lower right", patch: patch({ site: term("Lower right side", "RLQ / right pelvis") }) },
        { label: "Lower left", patch: patch({ site: term("Lower left side", "LLQ / left pelvis") }) },
        { label: "Lower middle", patch: patch({ site: term("Lower belly", "Suprapubic / pelvis") }) },
        { label: "All over", patch: patch({ site: term("All over belly", "Diffuse abdominal") }) },
      ],
    };
  }
  if (!cov.associated && negSet.length) {
    return {
      question: `Logged. Any ${negWords.join(" or ")} with it?`,
      targets: ["associated", "negatives"],
      options: [
        { label: "None of these", patch: patch({ addNegatives: negSet }) },
        ...negSet.map((n) => ({
          label: n.patient,
          patch: patch({ addAssociated: [n], addNegatives: negSet.filter((x) => x !== n) }),
        })),
      ],
    };
  }
  if (!cov.function) {
    return {
      question: "Logged. Did it stop you doing anything?",
      targets: ["function"],
      options: [
        { label: "Missed work or study", patch: patch({ addFunctional: [term("Missed work", "Absent from work")] }) },
        { label: "Had to lie down", patch: patch({ addFunctional: [term("Had to lie down", "Rest required during episode")] }) },
        { label: "Cancelled plans", patch: patch({ addFunctional: [term("Cancelled plans", "Cancelled social activities")] }) },
        { label: "Carried on as normal", patch: patch({ addFunctional: [term("Carried on as normal", "No functional limitation")] }) },
      ],
    };
  }
  if (!f.duration) {
    return {
      question: "Logged. How long did it last?",
      targets: ["timing"],
      options: [
        { label: "Under an hour", patch: patch({ duration: term("Under an hour", "<1h") }) },
        { label: "1–4 hours", patch: patch({ duration: term("1–4 hours", "1–4h") }) },
        { label: "Most of the day", patch: patch({ duration: term("Most of the day", ">6h") }) },
        { label: "Still going", patch: patch({ duration: term("Still going", "Ongoing at time of log") }) },
      ],
    };
  }
  return null;
}

export function applyPatch(f: HpiFields, p: AnswerPatch): HpiFields {
  const next = cloneFields(f);
  if (p.treatmentEfficacy)
    next.treatments = next.treatments.map((t) => (t.efficacy === "unknown" ? { ...t, efficacy: p.treatmentEfficacy! } : t));
  for (const a of p.addAssociated) {
    next.associated = addTerm(next.associated, a);
    next.negatives = removeTerm(next.negatives, a);
  }
  for (const n of p.addNegatives) if (!next.associated.some((a) => a.clinical === n.clinical)) next.negatives = addTerm(next.negatives, n);
  for (const fn of p.addFunctional) next.functional = addTerm(next.functional, fn);
  if (p.severity !== null) next.severity = Math.max(0, Math.min(10, Math.round(p.severity)));
  if (p.duration) next.duration = p.duration;
  if (p.site) next.site = p.site;
  return next;
}

export function extractLocal(text: string, createdAt: Date = new Date(), prior?: PriorContext): ExtractionResult {
  const { fields, region } = extractFields(text, createdAt, prior);
  return { fields, followUp: nextQuestion(fields, region) };
}
