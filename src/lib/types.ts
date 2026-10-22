// Core data model. Every clinical concept is stored twice: in the patient's own
// words (shown in the app) and in clinical vocabulary (shown to the doctor).
// That pairing is the "translation" the product sells.

export interface Term {
  patient: string;
  clinical: string;
}

export type Efficacy = "helped" | "partial" | "none" | "unknown";

export interface Treatment {
  name: string;
  dose: string | null;
  efficacy: Efficacy;
}

export interface HpiFields {
  complaint: Term | null;
  site: Term | null;
  character: Term[];
  radiation: Term | null;
  onset: Term | null;
  /** Stated clock time of onset, 24h "HH:MM", when the patient gave one. */
  onsetTime: string | null;
  nocturnal: boolean;
  duration: Term | null;
  severity: number | null;
  associated: Term[];
  negatives: Term[];
  exacerbating: Term[];
  relieving: Term[];
  treatments: Treatment[];
  functional: Term[];
  cycle: Term | null;
}

/** What tapping a follow-up pill does to the entry. Deliberately small and fixed. */
export interface AnswerPatch {
  treatmentEfficacy: Efficacy | null;
  addAssociated: Term[];
  addNegatives: Term[];
  severity: number | null;
  addFunctional: Term[];
  duration: Term | null;
  site: Term | null;
}

export interface FollowUpOption {
  label: string;
  patch: AnswerPatch;
}

export interface FollowUp {
  question: string;
  /** Which schema slot(s) the question is filling, e.g. ["relief", "negatives"]. */
  targets: SlotKey[];
  options: FollowUpOption[];
  answer?: string;
}

export type SlotKey =
  | "site"
  | "onset"
  | "character"
  | "radiation"
  | "associated"
  | "timing"
  | "modifiers"
  | "severity"
  | "function"
  | "relief"
  | "negatives";

export interface RedFlag {
  id: string;
  title: string;
  matched: string;
  crisis?: boolean;
}

export interface Entry {
  id: string;
  createdAt: string; // ISO
  rawText: string;
  fields: HpiFields;
  followUp: FollowUp | null;
  redFlag: RedFlag | null;
  source: "voice" | "text" | "seed";
  engine: "claude" | "local";
  editedTags: string[];
}

export interface Profile {
  name: string;
  dob: string;
  email: string;
  phone: string;
  lastConsult: string | null; // ISO date
  region: "AU" | "US";
}

export interface ExtractionResult {
  fields: HpiFields;
  followUp: FollowUp | null;
}

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  estimated: boolean;
}

export const emptyFields = (): HpiFields => ({
  complaint: null,
  site: null,
  character: [],
  radiation: null,
  onset: null,
  onsetTime: null,
  nocturnal: false,
  duration: null,
  severity: null,
  associated: [],
  negatives: [],
  exacerbating: [],
  relieving: [],
  treatments: [],
  functional: [],
  cycle: null,
});

export const emptyPatch = (): AnswerPatch => ({
  treatmentEfficacy: null,
  addAssociated: [],
  addNegatives: [],
  severity: null,
  addFunctional: [],
  duration: null,
  site: null,
});
