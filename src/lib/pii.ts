import type { Profile } from "./types";

// Strips identifiers before any text leaves the device. Runs on the phone;
// the server runs it again as defence in depth. The demo's "Under the hood"
// panel shows exactly what was removed and what was sent.

export interface Redaction {
  type: string;
  original: string;
}

const RELATIONS =
  "husband|wife|partner|boyfriend|girlfriend|fiance|fiancee|mum|mom|mother|dad|father|sister|brother|son|daughter|friend|boss|manager|housemate|flatmate|colleague";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function scrubPII(input: string, profile?: Partial<Profile>): { text: string; redactions: Redaction[] } {
  const redactions: Redaction[] = [];
  let text = input;
  const sub = (re: RegExp, type: string, replacement: string | ((m: string, ...g: string[]) => string)) => {
    text = text.replace(re, (m: string, ...rest: unknown[]) => {
      redactions.push({ type, original: m });
      return typeof replacement === "string" ? replacement : replacement(m, ...(rest.filter((x) => typeof x === "string") as string[]));
    });
  };

  sub(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "email", "[EMAIL]");
  sub(/\bhttps?:\/\/\S+/g, "url", "[URL]");
  sub(/(\+?61\s?|\b0)[2-478](?:[\s-]?\d){8}\b/g, "phone", "[PHONE]");
  // Medicare numbers start 2–6 and are 10–11 digits, often spaced 4-5-1.
  sub(/\b[2-6]\d{3}\s?\d{5}\s?\d{1,2}\b/g, "medicare", "[MEDICARE]");
  sub(/\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, "phone", "[PHONE]");
  sub(/\b(born on|dob|d\.o\.b\.?|date of birth)[:\s]+[\w\s/,-]{6,20}?\d{2,4}/gi, "dob", "[DOB]");
  sub(/\b\d{1,4}\s+[A-Z][a-z]+(\s[A-Z][a-z]+)?\s(Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Parade|Pde|Court|Ct|Place|Pl|Crescent|Cres|Highway|Hwy)\b\.?/g, "address", "[ADDRESS]");
  sub(/\b(Dr\.?|Doctor|Prof\.?|Professor|Nurse)\s+[A-Z][a-z'-]+(\s[A-Z][a-z'-]+)?/g, "clinician", "[CLINICIAN]");
  sub(/\b([A-Z][\w'-]+\s){1,3}(Hospital|Clinic|Medical Centre|Medical Center|Health Centre|Practice|Surgery|Imaging|Pathology)\b/g, "facility", "[FACILITY]");
  sub(new RegExp(`\\b([Mm]y|[Oo]ur)\\s(${RELATIONS})\\s([A-Z][a-z'-]+)`, "g"), "person", (_m, owner, rel) => `${owner} ${rel} [PERSON]`);

  if (profile?.name) {
    for (const part of profile.name.split(/\s+/).filter((p) => p.length > 1)) {
      sub(new RegExp(`\\b${escape(part)}\\b`, "gi"), "name", "[NAME]");
    }
  }
  if (profile?.dob) sub(new RegExp(escape(profile.dob), "g"), "dob", "[DOB]");
  return { text, redactions };
}
