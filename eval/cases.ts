import type { Efficacy } from "@medilog/engine";

// Held-out notes for comparing extraction engines. None of these were used
// to write or tune the rule engine's vocabulary; they deliberately use
// phrasing, slang and drug names the rules were not built around.
//
// Expected values are regex sources matched case-insensitively against each
// extracted term's patient and clinical text, so "nause" accepts "Nausea",
// "nauseous" or "Nausea / vomiting". `ok` lists extras that are acceptable
// but not required (they count neither for nor against an engine).

export type Region = "pelvic" | "abdomen" | "head" | "joints" | "back" | "chest" | "fatigue" | "rash" | "none";

export interface Expected {
  complaint: Region[]; // any of these is correct
  site?: string; // regex the site must match
  severity: (number | null)[]; // acceptable values; [null] means "not stated: don't invent one"
  nocturnal?: boolean;
  treatments: { name: string; efficacy: Efficacy[] }[];
  associated: string[];
  negatives: string[];
  functional: string[];
  ok?: string[];
}

export interface Case {
  id: string;
  note: string;
  expect: Expected;
}

export const CASES: Case[] = [
  {
    id: "endo-ponstan-uni",
    note: "Period pain from hell today, maybe 8/10, mostly on the left. Two Ponstan did sweet FA. Had to leave uni at lunch.",
    expect: { complaint: ["pelvic"], site: "left|LLQ", severity: [8], treatments: [{ name: "ponstan|mefenamic", efficacy: ["none"] }], associated: [], negatives: [], functional: ["uni|study|class|lecture"], ok: ["menstru|period|mens"] },
  },
  {
    id: "endo-ovary-night",
    note: "Woke up at 4 with stabbing pain in my left ovary, felt like a knife. Heat pack helped heaps. No fever.",
    expect: { complaint: ["pelvic"], site: "left|LLQ|ovar|adnex", severity: [null], nocturnal: true, treatments: [{ name: "heat", efficacy: ["helped"] }], associated: [], negatives: ["fever"], functional: ["sleep|woke|wak"] },
  },
  {
    id: "endo-bloat",
    note: "Bloated like I'm six months pregnant and crampy, lower belly, about a 5. Nothing helped.",
    expect: { complaint: ["pelvic", "abdomen"], site: "lower|pelv|suprapubic", severity: [5], treatments: [], associated: ["bloat|distens"], negatives: [], functional: [] },
  },
  {
    id: "endo-dyspareunia",
    note: "Sex was really painful again last night, deep inside on the right. Stopped halfway. Pain about 6 after.",
    expect: { complaint: ["pelvic"], site: "right|RLQ|deep|pelv|vagin", severity: [6], treatments: [], associated: ["sex|dyspareun|intercourse|coital"], negatives: [], functional: [], ok: ["stop|interrupt|unable"] },
  },
  {
    id: "endo-dyschezia",
    note: "Pain when I poo again, sharp, right side low down. 7 out of 10. Took Buscopan, bit better.",
    expect: { complaint: ["pelvic", "abdomen"], site: "right|RLQ|RIF", severity: [7], treatments: [{ name: "buscopan|hyoscine", efficacy: ["partial"] }], associated: ["poo|defecat|bowel|dyschez|stool"], negatives: [], functional: [] },
  },
  {
    id: "endo-wedding",
    note: "Missed my sister's wedding rehearsal because of the cramps. Spent the arvo curled up on the bathroom floor, maybe 9/10. Panadeine Forte barely touched it.",
    expect: { complaint: ["pelvic", "abdomen"], severity: [9], treatments: [{ name: "panadeine|codeine|paracetamol", efficacy: ["partial", "none"] }], associated: [], negatives: [], functional: ["miss|cancel|social|event|wedding|plans"], ok: ["bed|lying|floor|curled|rest|unable"] },
  },
  {
    id: "endo-midcycle",
    note: "Mid-cycle twinge on the left, dull, about a 3, didn't need anything.",
    expect: { complaint: ["pelvic", "abdomen"], site: "left|LLQ", severity: [3], treatments: [], associated: [], negatives: [], functional: [], ok: ["mid|ovulat|cycle"] },
  },
  {
    id: "endo-no-meds",
    note: "Didn't take anything for the cramps this time, wanted to see if it settles. Around a 4 by bedtime.",
    expect: { complaint: ["pelvic", "abdomen"], severity: [4], treatments: [], associated: [], negatives: [], functional: [] },
  },
  {
    id: "migraine-triptan-vomit",
    note: "Migraine kicked in around 6am, left side behind the eye, throbbing, threw up twice. Sumatriptan worked after an hour.",
    expect: { complaint: ["head"], site: "left|L |retro|eye|orbit", severity: [null], treatments: [{ name: "sumatriptan|triptan", efficacy: ["helped"] }], associated: ["vomit|threw up|emesis"], negatives: [], functional: [] },
  },
  {
    id: "migraine-aura-work",
    note: "Zigzag lights in my vision then a pounding headache, 7/10. Had to lie in a dark room all afternoon, couldn't work.",
    expect: { complaint: ["head"], severity: [7], treatments: [], associated: ["aura|zig|visual"], negatives: [], functional: ["work"], ok: ["lie|dark|rest|bed|light|photo"] },
  },
  {
    id: "headache-band",
    note: "Headache again, both temples, like a tight band, 4/10. Two Panadol, took the edge off. No nausea this time.",
    expect: { complaint: ["head"], site: "temp|bilat|both", severity: [4], treatments: [{ name: "panadol|paracetamol", efficacy: ["partial"] }], associated: [], negatives: ["nause"], functional: [] },
  },
  {
    id: "migraine-rizatriptan",
    note: "Woke with a splitting head and the light was unbearable. Rizatriptan did nothing.",
    expect: { complaint: ["head"], severity: [null], nocturnal: true, treatments: [{ name: "rizatriptan|triptan", efficacy: ["none"] }], associated: ["light|photo"], negatives: [], functional: [], ok: ["sleep|woke|wak"] },
  },
  {
    id: "rheum-sausage-fingers",
    note: "Fingers on both hands swollen like sausages this morning, stiff for about two hours, couldn't do up my buttons.",
    expect: { complaint: ["joints"], site: "finger|hand|digit|MCP|PIP", severity: [null], treatments: [], associated: ["swell|swollen|dactyl", "stiff"], negatives: [], functional: ["button|grip|dress|fine motor|hand"] },
  },
  {
    id: "rheum-hot-knee",
    note: "My right knee is hot and puffy, hurts to walk, 6/10. Ibuprofen gel helped a little.",
    expect: { complaint: ["joints"], site: "knee", severity: [6], treatments: [{ name: "ibuprofen", efficacy: ["partial"] }], associated: ["swell|puff|effusion|warm|hot"], negatives: [], functional: [], ok: ["walk|mobil|gait|weight"] },
  },
  {
    id: "rheum-malar-rash",
    note: "Wrists and ankles aching all over, plus a red rash across my cheeks after being in the sun.",
    expect: { complaint: ["joints", "rash"], site: "wrist|ankle", severity: [null], treatments: [], associated: ["rash|malar|erythem"], negatives: [], functional: [], ok: ["sun|photo"] },
  },
  {
    id: "rheum-fatigue-fog",
    note: "Joints are a 5 today, so tired I napped twice, brain like soup.",
    expect: { complaint: ["joints", "fatigue"], severity: [5], treatments: [], associated: ["tired|fatigue|exhaust", "fog|cognit|concentr|brain|think"], negatives: [], functional: [], ok: ["nap|rest|sleep"] },
  },
  {
    id: "gi-reflux",
    note: "Upper stomach burning after dinner, worse lying down, Gaviscon helped.",
    expect: { complaint: ["abdomen", "chest"], site: "upper|epigast", severity: [null], treatments: [{ name: "gaviscon|antacid|alginate", efficacy: ["helped"] }], associated: [], negatives: [], functional: [], ok: ["lying|supine|recumb|meal|eat|food|dinner"] },
  },
  {
    id: "gi-diarrhoea",
    note: "Diarrhoea five times since lunch and crampy all over my belly, about a 6. No blood.",
    expect: { complaint: ["abdomen"], severity: [6], treatments: [], associated: ["diarr|loose"], negatives: ["blood"], functional: [] },
  },
  {
    id: "back-sciatica",
    note: "Lower back seized up lifting the washing basket, shooting down my left leg, 8/10. Couldn't drive to work.",
    expect: { complaint: ["back"], site: "lower|lumb", severity: [8], treatments: [], associated: [], negatives: [], functional: ["work|drive"], ok: ["leg|radiat|sciat|lift"] },
  },
  {
    id: "fatigue-wiped",
    note: "Completely wiped, slept 11 hours and still exhausted, couldn't concentrate at work.",
    expect: { complaint: ["fatigue"], severity: [null], treatments: [], associated: ["concentr|fog|cognit"], negatives: [], functional: [], ok: ["work|sleep|hypersomn|unrefresh|exhaust|tired|fatigue"] },
  },
  {
    id: "rash-hives",
    note: "Itchy raised welts on my arms and neck after the new washing powder, no swelling of lips or throat.",
    expect: { complaint: ["rash"], site: "arm|neck", severity: [null], treatments: [], associated: ["itch|prurit"], negatives: ["lip|throat|swell|angio"], functional: [], ok: ["welt|hive|urtic|wheal|detergent|powder"] },
  },
  {
    id: "good-day",
    note: "Good day today! No pain at all, slept through.",
    expect: { complaint: ["none", "pelvic", "abdomen", "head", "joints", "back", "fatigue", "rash", "chest"], severity: [0, null], treatments: [], associated: [], negatives: [], functional: [], ok: ["pain|sleep"] },
  },
  {
    id: "chest-anxiety",
    note: "Chest feels tight when I'm anxious, not painful, settles in a few minutes.",
    expect: { complaint: ["chest"], severity: [null], treatments: [], associated: [], negatives: [], functional: [], ok: ["anx|pain|tight|stress|minute|settle"] },
  },
  {
    id: "pelvic-negation",
    note: "Pelvic pain about a 6, no vomiting or fever, didn't bother with painkillers.",
    expect: { complaint: ["pelvic"], severity: [6], treatments: [], associated: [], negatives: ["vomit", "fever"], functional: [] },
  },
];

/** Notes that must trigger the emergency interrupt, and look-alikes that must not. */
export const RED_FLAG_CASES: { note: string; flag: boolean; why: string }[] = [
  { note: "I passed out on the bathroom floor and hit my head", flag: true, why: "loss of consciousness" },
  { note: "Heart is pounding and I suddenly can't feel my left arm", flag: true, why: "possible stroke" },
  { note: "My lips and tongue are swelling up after the antibiotic", flag: true, why: "anaphylaxis" },
  { note: "Coughing up blood this morning", flag: true, why: "haemoptysis" },
  { note: "Worst headache I've ever had, came on in seconds", flag: true, why: "thunderclap headache, paraphrased" },
  { note: "Face went numb on one side and my words came out slurred", flag: true, why: "stroke, paraphrased" },
  { note: "Soaked through a super tampon in two hours and I'm really dizzy getting up", flag: true, why: "heavy bleeding with dizziness" },
  { note: "I've been thinking everyone would be better off without me", flag: true, why: "suicidal ideation, indirect" },
  { note: "Crushing pressure in my chest and my jaw aches", flag: true, why: "cardiac" },
  { note: "Can't catch my breath even sitting still", flag: true, why: "breathing" },
  { note: "No chest pain, just tired", flag: false, why: "negated" },
  { note: "Haven't fainted, just a bit lightheaded", flag: false, why: "negated" },
  { note: "Not the worst headache ever, just annoying", flag: false, why: "negated" },
  { note: "Period is heavy but normal for me, no clots", flag: false, why: "ordinary heavy period" },
  { note: "Bit short of breath walking up the hill, fine once I stopped", flag: false, why: "exertional, resolved" },
];

/** Urgent-but-not-000 presentations the product may want a softer "see a doctor today" prompt for. Reported, not scored. */
export const URGENT_CARE_CASES = [
  "Really bad pain on my right side, fever of 39 and I can't stand up straight",
  "8 weeks pregnant, sharp one-sided pain and some spotting",
];
