import { cloneFields, type Efficacy, type HpiFields, type Term } from "./types";

// Tags are a view over the structured fields. Editing a tag edits the field,
// so the patient corrects the record without ever seeing a form.

export type TagKind =
  | "site"
  | "character"
  | "radiation"
  | "onset"
  | "duration"
  | "severity"
  | "associated"
  | "negative"
  | "treatment"
  | "functional"
  | "cycle"
  | "modifier";

export interface Tag {
  key: string;
  kind: TagKind;
  emoji: string;
  label: string;
  clinical: string;
  index: number;
}

export const EFFICACY_LABEL: Record<Efficacy, string> = {
  helped: "helped",
  partial: "minimal relief",
  none: "no relief",
  unknown: "effect not noted",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const FUNCTIONAL_EMOJI = (t: Term) =>
  /work|study/i.test(t.clinical) ? "💼" : /sleep/i.test(t.clinical) ? "🛌" : /bed|rest/i.test(t.clinical) ? "🛏️" : "🚫";

export function tagsFor(f: HpiFields): Tag[] {
  const tags: Tag[] = [];
  const push = (kind: TagKind, emoji: string, term: Term, index = 0) =>
    tags.push({ key: `${kind}-${index}`, kind, emoji, label: cap(term.patient), clinical: term.clinical, index });

  if (f.site) push("site", "📍", f.site);
  f.character.forEach((t, i) => push("character", "⚡", t, i));
  if (f.radiation) push("radiation", "↘️", f.radiation);
  if (f.severity !== null) push("severity", "🎚️", { patient: `${f.severity}/10`, clinical: `NRS ${f.severity}/10` });
  if (f.onset) push("onset", f.nocturnal ? "🌙" : "🕒", f.onset);
  if (f.duration) push("duration", "⏱️", f.duration);
  f.treatments.forEach((t, i) =>
    push("treatment", "💊", { patient: `${t.name}: ${EFFICACY_LABEL[t.efficacy]}`, clinical: `${t.name}${t.dose ? ` ${t.dose}` : ""}: ${EFFICACY_LABEL[t.efficacy]}` }, i),
  );
  f.associated.forEach((t, i) => push("associated", "➕", t, i));
  f.negatives.forEach((t, i) => push("negative", "⊘", { patient: `No ${t.patient.toLowerCase()}`, clinical: `Denies ${t.clinical.toLowerCase()}` }, i));
  f.functional.forEach((t, i) => push("functional", FUNCTIONAL_EMOJI(t), t, i));
  [...f.exacerbating, ...f.relieving].forEach((t, i) => push("modifier", "↕️", t, i));
  if (f.cycle) push("cycle", "🩸", f.cycle);
  return tags;
}

const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * One calm line describing an entry, in the patient's own words, for lists:
 * "Lower right side · sharp, cramping · woke me at 3 AM · ibuprofen: minimal relief".
 * Severity is left out; lists show it separately.
 */
export function entrySummary(f: HpiFields, maxParts = 5): string {
  const parts: string[] = [];
  if (f.site) parts.push(f.site.patient);
  if (f.character.length) parts.push(f.character.map((c) => c.patient.toLowerCase()).join(", "));
  if (f.onset) parts.push(f.onset.patient);
  for (const t of f.treatments) parts.push(t.efficacy === "unknown" ? t.name : `${t.name}: ${EFFICACY_LABEL[t.efficacy]}`);
  for (const a of f.associated) parts.push(a.patient);
  for (const fn of f.functional) parts.push(fn.patient);
  if (f.cycle) parts.push(f.cycle.patient);
  const shown = parts.slice(0, maxParts).map((p, i) => (i === 0 ? cap(p) : lower(p)));
  return shown.join(" · ") + (parts.length > maxParts ? " …" : "");
}

export type TagEdit =
  | { type: "remove" }
  | { type: "rename"; patient: string; clinical: string }
  | { type: "severity"; value: number }
  | { type: "efficacy"; value: Efficacy };

export function editTag(f: HpiFields, tag: Tag, edit: TagEdit): HpiFields {
  const next = cloneFields(f);
  const listFor = (kind: TagKind): Term[] | null =>
    kind === "character" ? next.character : kind === "associated" ? next.associated : kind === "negative" ? next.negatives : kind === "functional" ? next.functional : null;

  if (edit.type === "remove") {
    switch (tag.kind) {
      case "severity":
        next.severity = null;
        break;
      case "treatment":
        next.treatments.splice(tag.index, 1);
        break;
      case "modifier":
        if (tag.index < next.exacerbating.length) next.exacerbating.splice(tag.index, 1);
        else next.relieving.splice(tag.index - next.exacerbating.length, 1);
        break;
      case "onset":
        next.onset = null;
        next.nocturnal = false;
        break;
      case "site":
      case "radiation":
      case "duration":
      case "cycle":
        next[tag.kind] = null;
        break;
      default:
        listFor(tag.kind)?.splice(tag.index, 1);
    }
    return next;
  }
  if (edit.type === "severity") next.severity = edit.value;
  if (edit.type === "efficacy" && next.treatments[tag.index]) next.treatments[tag.index].efficacy = edit.value;
  if (edit.type === "rename") {
    const term = { patient: edit.patient, clinical: edit.clinical };
    switch (tag.kind) {
      case "site":
      case "radiation":
      case "onset":
      case "duration":
      case "cycle":
        next[tag.kind] = term;
        break;
      case "modifier":
        if (tag.index < next.exacerbating.length) next.exacerbating[tag.index] = term;
        else next.relieving[tag.index - next.exacerbating.length] = term;
        break;
      case "negative":
        next.negatives[tag.index] = { patient: edit.patient.replace(/^no /i, ""), clinical: edit.clinical.replace(/^denies /i, "") };
        break;
      default: {
        const list = listFor(tag.kind);
        if (list) list[tag.index] = term;
      }
    }
  }
  return next;
}
