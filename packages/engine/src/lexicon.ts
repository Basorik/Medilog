import type { Term } from "./types";

// Clinical vocabulary for the on-device extraction engine. Each entry maps the
// way patients actually talk onto the term a clinician would write.

export interface LexEntry {
  re: RegExp;
  term: Term;
}

const t = (patient: string, clinical = patient): Term => ({ patient, clinical });

export const ASSOCIATED: LexEntry[] = [
  { re: /\b(nause\w*|felt sick|feeling sick|queasy)\b/, term: t("Nausea") },
  { re: /\b(vomit\w*|threw up|throwing up|being sick)\b/, term: t("Vomiting") },
  { re: /\b(fevers?|feverish|temperature|chills|shivery|rigors)\b/, term: t("Fever", "Fever / chills") },
  { re: /\bbloat\w*/, term: t("Bloating", "Abdominal bloating") },
  { re: /\b(exhausted|so tired|tired|fatigue\w*|wiped out|drained|no energy)\b/, term: t("Exhaustion", "Fatigue") },
  { re: /\b(dizzy|dizziness|light[- ]?headed)\b/, term: t("Dizziness", "Light-headedness") },
  {
    re: /\b(hurts?|pain\w*|painful) (when|to) (i )?(go to the toilet|poo\w*|have a bowel movement|open my bowels)|painful (poo|bowel movements?)/,
    term: t("Pain with bowel movements", "Dyschezia"),
  },
  { re: /\b(burn\w*|hurts?|stings?|pain\w*) when (i )?(pee|wee|urinat\w*)/, term: t("Pain when peeing", "Dysuria") },
  { re: /\b(pain\w*|hurts?|hurt) (during|with|after) sex|painful sex/, term: t("Pain during sex", "Dyspareunia") },
  { re: /\bheavy (bleeding|flow|period)|\bflooding\b|\bclots?\b/, term: t("Heavy bleeding", "Heavy menstrual bleeding") },
  { re: /\bspotting\b/, term: t("Spotting", "Intermenstrual spotting") },
  { re: /\b(diarrh\w*|loose stools?|the runs)\b/, term: t("Diarrhoea") },
  { re: /\bconstipat\w*/, term: t("Constipation") },
  { re: /\blights?\b[^.,]{0,20}\b(hurts?|hurting|bother\w*|too bright)|sensitive to (the )?light|light sensitiv\w*/, term: t("Light sensitivity", "Photophobia") },
  { re: /\bsensitive to (noise|sound)|(noise|sound) (hurts?|bothers?)/, term: t("Noise sensitivity", "Phonophobia") },
  { re: /\baura\b|zig ?zags?|flashing lights|blind spot/, term: t("Visual aura", "Visual aura") },
  { re: /\b(swollen|swelling|puffy)\b/, term: t("Swelling", "Swelling") },
  { re: /\bmorning stiff\w*|stiff\w* (in the|first thing in the|this) morning/, term: t("Morning stiffness", "Early-morning stiffness") },
  { re: /\bstiff(ness)?\b(?![^.]*\bmorning)/, term: t("Stiffness", "Stiffness") },
  { re: /\b(rash|hives|red patches|blotchy)\b/, term: t("Rash", "Rash") },
  { re: /\bbrain fog|\bfoggy\b|couldn'?t (think|concentrate)/, term: t("Brain fog", "Cognitive fog") },
  { re: /\bshort of breath|breathless\w*/, term: t("Short of breath", "Dyspnoea") },
  { re: /\bpalpitations?|heart (racing|pounding)|racing heart/, term: t("Racing heart", "Palpitations") },
  { re: /\bheadaches?\b/, term: t("Headache") },
];

export const CHARACTER: LexEntry[] = [
  { re: /\bsharp\b/, term: t("Sharp") },
  { re: /\b(stabbing|stabby|knife)\b/, term: t("Stabbing") },
  { re: /\bcramp\w*/, term: t("Cramping") },
  { re: /\bdull\b/, term: t("Dull") },
  { re: /\b(ache|aching|achy)\b/, term: t("Aching") },
  { re: /\b(throbbing|pounding|pulsing)\b/, term: t("Throbbing") },
  { re: /\bburning\b/, term: t("Burning") },
  { re: /\b(pressure|heavy feeling|dragging)\b/, term: t("Heavy / dragging", "Pressure / dragging") },
  { re: /\bshooting\b/, term: t("Shooting") },
  { re: /\b(tight|tightness)\b/, term: t("Tight", "Tightness") },
];

export interface TreatmentLex {
  re: RegExp;
  name: string;
}

export const TREATMENTS: TreatmentLex[] = [
  { re: /\b(ibuprofen|nurofen|advil|brufen)\b/, name: "Ibuprofen" },
  { re: /\b(paracetamol|panadol|tylenol|acetaminophen)\b/, name: "Paracetamol" },
  { re: /\b(naproxen|naprosyn|aleve|naprogesic)\b/, name: "Naproxen" },
  { re: /\b(codeine|panadeine)\b/, name: "Codeine" },
  { re: /\b(ponstan|mefenamic)\b/, name: "Mefenamic acid" },
  { re: /\bbuscopan\b/, name: "Hyoscine butylbromide" },
  { re: /\b(sumatriptan|imigran|triptans?)\b/, name: "Sumatriptan" },
  { re: /\b(heat ?packs?|hot water bottle|wheat ?bag|heating pad)\b/, name: "Heat pack" },
  { re: /\b(hot|warm) (bath|shower)\b/, name: "Warm bath" },
  { re: /\btens( machine)?\b/, name: "TENS" },
  { re: /\b(lay down|lie down|lying down|rested)\b/, name: "Rest" },
];

export const EFFICACY_NONE =
  /didn'?t (help|work|do (anything|much)|touch it|really help|make (a|any) difference)|did nothing|no (help|relief|difference)|(not|isn'?t|wasn'?t) helping|useless|nothing helps|doesn'?t (help|work)/;
export const EFFICACY_PARTIAL =
  /(helped|helps|helping) (a (bit|little)|slightly|somewhat|a tiny bit)|barely help\w*|took the edge off|bit better|slightly better|eased (it )?(a bit|slightly|a little)|(sort|kind) of help\w*/;
export const EFFICACY_HELPED = /\b(helped|helps|worked|settled it|fixed it|eased it|made it better|relieved it)\b/;

export const FUNCTIONAL: LexEntry[] = [
  {
    re: /(couldn'?t|could not|didn'?t) (go|make it) (in )?to work|called in sick|(missed|skipped) (work|my (\w+ )?shift|a shift)|took (the|a) (day|sick day) off|\boff work\b|sick day/,
    term: t("Missed work", "Absent from work"),
  },
  { re: /left work early|went home early|leave work early|had to leave work/, term: t("Left work early", "Left work early") },
  { re: /missed (uni|class|school|lectures?)|couldn'?t go to (uni|school|class)/, term: t("Missed study", "Absent from study") },
  {
    re: /\b(woke|waking|woken|wakes) (me )?(up)?|\bup at \d|couldn'?t (get to )?sleep|kept me (up|awake)|no sleep/,
    term: t("Sleep disrupted", "Sleep disturbance (woken by pain)"),
  },
  { re: /stayed in bed|bed all day|couldn'?t get out of bed|bedridden/, term: t("Stuck in bed", "Bedbound during episode") },
  {
    re: /cancel+ed (\w+ )?(plans|dinner|lunch|drinks|catch[- ]?up|gym|date|the gym)|missed (a |the |my )?(party|dinner|event|birthday)/,
    term: t("Cancelled plans", "Cancelled social activities"),
  },
  { re: /couldn'?t (exercise|go to the gym|run|go for a run|walk the dog)/, term: t("Couldn't exercise", "Unable to exercise") },
  { re: /couldn'?t (look after|pick up|care for) (the|my) (kids|children)/, term: t("Couldn't look after kids", "Unable to perform caring duties") },
  { re: /couldn'?t drive/, term: t("Couldn't drive", "Unable to drive") },
  { re: /couldn'?t (open|grip|hold|do up|button|write|type)/, term: t("Trouble using hands", "Impaired grip / fine motor tasks") },
];

export const CYCLE: LexEntry[] = [
  {
    re: /period (started|came|arrived|has started|just started)|started my period|first day of (my )?period|day (1|one) of (my )?period/,
    term: t("Period started (day 1)", "Menses day 1"),
  },
  { re: /period (is )?(due|coming|late)|before my period|pre-?period/, term: t("Period due", "Premenstrual") },
  { re: /\bon my period|during my period|period day \d|day \d of (my )?period/, term: t("During period", "Menstruating") },
  { re: /\bovulat\w*|mid[- ]?cycle/, term: t("Mid-cycle", "Mid-cycle") },
];

export const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
