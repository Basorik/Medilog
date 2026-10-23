import type { RedFlag } from "./types";

// Deterministic emergency screen. Runs on-device before any AI call, takes
// microseconds, and cannot be talked out of a match by a model. Kept
// deliberately simple and auditable: a reviewer can read every rule.

interface Rule {
  id: string;
  title: string;
  /** All patterns in a group must match (AND); any group matching fires the rule (OR). */
  any: RegExp[][];
  crisis?: boolean;
}

const RULES: Rule[] = [
  {
    id: "cardiac",
    title: "Possible heart emergency",
    any: [
      [/chest (pain|pressure|tightness)|pain in my chest/, /crushing|squeezing|pressure|heavy|tight|(arm|jaw|neck)|sweat|short of breath|can'?t breathe/],
      [/crushing (pain|feeling)/, /chest/],
      [/(crushing|squeezing|heavy|heaviness|pressure) .{0,20}\b(in|on|across) (my |the )?chest/],
    ],
  },
  {
    id: "stroke",
    title: "Possible stroke",
    any: [
      [/(face|mouth|smile) (is |went |has gone |feels |is going )?(droop\w*|numb|lopsided|crooked)|droopy face|one side of my face|numb on one side/],
      [/\bslurr(ed|ing)\b|can'?t (speak|get my words out)|words (came|coming) out wrong/],
      [/(can'?t (move|feel|lift)|weak\w*|numb\w*) (in )?(my )?(left|right|one) (side|arm|leg)/],
      [/sudden(ly)? (lost|loss of|can'?t) (my )?(vision|see)/],
    ],
  },
  {
    id: "thunderclap",
    title: "Sudden severe headache",
    any: [
      [/thunderclap/],
      [/worst headache (of my life|ever|i'?ve ever had|i have ever had)/],
      [/sudden\w* (severe|explosive|excruciating) headache/],
      [/headache/, /came on (in|within) (seconds|a second|an instant)|hit me like a|out of nowhere.{0,20}worst/],
    ],
  },
  {
    id: "breathing",
    title: "Difficulty breathing",
    any: [[/can'?t (breathe|catch my breath)|struggling to breathe|gasping|lips (are |went )?(blue|grey)/]],
  },
  {
    id: "anaphylaxis",
    title: "Possible severe allergic reaction",
    any: [[/(throat|tongue|lips?) (is |are |feels? )?(swell\w*|closing|tight)/]],
  },
  {
    id: "haemorrhage",
    title: "Severe bleeding",
    any: [
      [/soak\w* (through )?(a |my )?(pad|tampon|cup)s? (every|in an?|within an?) (hour|30)/],
      [/soak\w* (through )?(an? |my )?(\w+ )?(pad|tampon|cup|undies|pants|clothes|sheets)/, /dizz|faint|light-?headed|passing out|every hour|within an hour|in (an?|one|two|2|1) hours?/],
      [/(vomit\w*|throwing up|coughing( up)?) blood|blood in (my )?vomit/],
      [/black,? tarry|tarry (poo|stool)/],
      [/bleeding (heavily|a lot)|heavy bleeding/, /pregnan\w*|dizzy|faint\w*|passing out/],
    ],
  },
  {
    id: "collapse",
    title: "Loss of consciousness or seizure",
    any: [[/\b(fainted|passed out|blacked out|lost consciousness|unconscious|collapsed)\b/], [/\b(seizure|fitting|convuls\w*)\b/]],
  },
  {
    id: "self-harm",
    title: "You deserve support right now",
    crisis: true,
    any: [
      [/(kill|hurt|harm) myself|suicid\w*|end (it all|my life)|don'?t want to (be here|live)|better off dead|better off without me|no reason to (live|keep going)|can'?t go on/],
    ],
  },
];

const NEGATED = /\b(no|not|without|denies|never|wasn'?t|isn'?t|haven'?t|hasn'?t|didn'?t|don'?t)\s+(\w+\s+){0,2}$/;

function firstUnnegatedMatch(text: string, re: RegExp): string | null {
  const g = new RegExp(re.source, "g");
  for (const m of text.matchAll(g)) {
    const clauseStart = Math.max(text.lastIndexOf(".", m.index), text.lastIndexOf(",", m.index), 0);
    if (!NEGATED.test(text.slice(clauseStart, m.index))) return m[0];
  }
  return null;
}

export function screenRedFlags(raw: string): RedFlag | null {
  const text = raw.toLowerCase().replace(/[‘’]/g, "'");
  for (const rule of RULES) {
    for (const group of rule.any) {
      const hits = group.map((re) => firstUnnegatedMatch(text, re));
      if (hits.every(Boolean)) return { id: rule.id, title: rule.title, matched: hits[0]!, crisis: rule.crisis };
    }
  }
  return null;
}

export const EMERGENCY = {
  AU: { number: "000", crisisLine: "Lifeline 13 11 14", crisisTel: "131114" },
  US: { number: "911", crisisLine: "988 Suicide & Crisis Lifeline", crisisTel: "988" },
} as const;
