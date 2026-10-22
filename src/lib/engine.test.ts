import { describe, expect, it } from "vitest";
import { applyPatch, extractLocal } from "./extract";
import { scrubPII } from "./pii";
import { screenRedFlags } from "./redflags";
import { buildReportData, findDiagnosticLanguage, makeRange, renderHpiLocal, renderSoapboxLocal } from "./report";
import { buildSeedEntries, DEMO_PROFILE, SEED_NOTES } from "./seed";
import { editTag, tagsFor } from "./tags";

const NOW = new Date(2026, 9, 22, 9, 0);

describe("on-device extraction", () => {
  it("maps the pitch example and asks the pitch's follow-up", () => {
    const { fields, followUp } = extractLocal(
      "Woke up at 3 AM with that sharp cramping in my lower right side again, took two ibuprofen and used a heat pack.",
      NOW,
    );
    expect(fields.site?.clinical).toBe("RLQ / right pelvis");
    expect(fields.character.map((c) => c.patient)).toEqual(["Sharp", "Cramping"]);
    expect(fields.nocturnal).toBe(true);
    expect(fields.onset?.clinical).toBe("Woken from sleep ~03:00");
    expect(fields.treatments.map((t) => [t.name, t.efficacy])).toEqual([
      ["Ibuprofen", "unknown"],
      ["Heat pack", "unknown"],
    ]);
    expect(followUp?.question).toBe("Logged. Did the ibuprofen and heat pack help, and did you have any fever or nausea?");
    expect(followUp?.targets).toEqual(["relief", "negatives"]);
  });

  it("applies a tapped answer to treatments and pertinent negatives", () => {
    const { fields, followUp } = extractLocal("Woke at 3 with cramps low on my right side, took ibuprofen", NOW);
    const next = applyPatch(fields, followUp!.options.find((o) => o.label === "Barely helped")!.patch);
    expect(next.treatments[0].efficacy).toBe("partial");
    expect(next.negatives.map((n) => n.clinical)).toEqual(["Fever / chills", "Nausea"]);
  });

  it("handles negation, severity phrasing and efficacy carried across clauses", () => {
    const { fields } = extractLocal("Pelvic pain about a 6, no fever or nausea. Took naproxen, didn't really help.", NOW);
    expect(fields.severity).toBe(6);
    expect(fields.associated).toEqual([]);
    expect(fields.negatives.map((n) => n.clinical).sort()).toEqual(["Fever / chills", "Nausea"]);
    expect(fields.treatments[0]).toMatchObject({ name: "Naproxen", efficacy: "none" });
  });

  it("does not read a clock time as a severity score", () => {
    expect(extractLocal("Cramps woke me up around 3", NOW).fields.severity).toBeNull();
  });

  it("translates patient words into clinical vocabulary", () => {
    const { fields } = extractLocal("Cramping all day, hurts when I go to the toilet, called in sick", NOW);
    expect(fields.associated.map((a) => [a.patient, a.clinical])).toContainEqual(["Pain with bowel movements", "Dyschezia"]);
    expect(fields.functional.map((f) => f.clinical)).toContain("Absent from work");
  });

  it("covers other beachhead conditions", () => {
    const migraine = extractLocal("Migraine started around 2pm behind my right eye, throbbing, lights are really bothering me.", NOW).fields;
    expect(migraine.complaint).toEqual({ patient: "Migraine", clinical: "Headache" });
    expect(migraine.site?.clinical).toBe("R Retro-orbital");
    expect(migraine.associated.map((a) => a.clinical)).toContain("Photophobia");

    const joints = extractLocal("My knees and wrists are swollen and stiff this morning", NOW).fields;
    expect(joints.complaint?.clinical).toBe("Arthralgia");
    expect(joints.associated.map((a) => a.clinical)).toEqual(["Swelling", "Early-morning stiffness"]);
  });

  it("never asks 'why'", () => {
    for (const note of SEED_NOTES) {
      const q = extractLocal(note.text, NOW).followUp?.question ?? "";
      expect(q).not.toMatch(/\bwhy\b/i);
    }
  });
});

describe("red-flag screen", () => {
  it.each([
    "Sudden crushing chest pain spreading into my left arm",
    "worst headache of my life came on suddenly",
    "my face is drooping and my words are coming out wrong",
    "soaking through a pad every hour and feel dizzy",
    "I fainted in the shower",
    "I don't want to be here anymore",
  ])("flags %s", (text) => {
    expect(screenRedFlags(text)).not.toBeNull();
  });

  it("marks self-harm as a crisis", () => {
    expect(screenRedFlags("I want to kill myself")?.crisis).toBe(true);
  });

  it.each(["No chest pain, just cramps", "Cramping low on my right, no fainting", "headache, not the worst ever"])("does not flag %s", (text) => {
    expect(screenRedFlags(text)).toBeNull();
  });

  it("passes every seeded note", () => {
    for (const n of SEED_NOTES) expect(screenRedFlags(n.text)).toBeNull();
  });
});

describe("PII scrubbing", () => {
  it("removes clinicians, facilities, phone numbers, people and the patient's own name", () => {
    const { text, redactions } = scrubPII(
      "Maya here. Booked with Dr Patel at Northside Women's Clinic, call them on 02 9123 4567. My partner Sam drove me. Email maya.thompson@example.com",
      DEMO_PROFILE(NOW),
    );
    expect(text).not.toMatch(/Patel|Northside|9123|Sam|Maya|example\.com/);
    expect(new Set(redactions.map((r) => r.type))).toEqual(new Set(["clinician", "facility", "phone", "person", "name", "email"]));
  });

  it("leaves symptom text alone", () => {
    const t = "Sharp pain in my right pelvis, 7 out of 10, ibuprofen didn't help";
    expect(scrubPII(t).text).toBe(t);
  });
});

describe("appointment report", () => {
  const entries = buildSeedEntries(NOW);
  const data = buildReportData(entries, makeRange("30d", NOW, null), DEMO_PROFILE(NOW));

  it("answers every seeded follow-up with a real option", () => {
    entries.forEach((e, i) => expect(e.followUp?.answer, SEED_NOTES[i].text).toBeTruthy());
  });

  it("computes the headline numbers from the logs", () => {
    expect(data.episodes).toBe(12);
    expect(data.workDaysMissed).toBe(3);
    expect(data.nocturnal).toEqual({ n: 7, from: "02:30", to: "03:30" });
    expect(data.severity).toMatchObject({ median: 6.5, min: 4, max: 9 });
    expect(data.cycle?.perimenstrual).toBe(6);
    expect(data.treatments.find((t) => t.name === "Ibuprofen")).toMatchObject({ uses: 5, none: 3, partial: 2 });
  });

  it("uses the stated onset time, not the time the note was logged", () => {
    const late = new Date(2026, 9, 21, 22, 15);
    const { fields } = extractLocal("Woke at 3am with sharp pain low on my right side, 7/10", late);
    const extra = { ...entries[0], id: "late", createdAt: late.toISOString(), fields };
    const d = buildReportData([...entries, extra], makeRange("30d", NOW, null));
    expect(d.nocturnal).toMatchObject({ from: "02:30", to: "03:30" });
  });

  it("writes a first-person opener with the key facts", () => {
    const script = renderSoapboxLocal(data);
    expect(script[0]).toBe("I've had 12 episodes of cramping and sharp pain in my lower right side over the last 30 days, mostly waking me around 3 AM.");
    expect(script.join(" ")).toContain("I've missed 3 days of work");
    expect(script.length).toBeLessThanOrEqual(4);
  });

  it("produces a non-diagnostic HPI with identifiers removed from quotes", () => {
    const hpi = renderHpiLocal(data);
    expect(hpi.chiefComplaint).toMatch(/^Recurrent lower abdominal \/ pelvic pain/);
    const all = [hpi.chiefComplaint, ...hpi.sections.filter((s) => s.title !== "In the patient's words").flatMap((s) => s.lines)];
    expect(findDiagnosticLanguage(all)).toBeNull();
    expect(JSON.stringify(hpi)).not.toMatch(/Patel|Northside|9123/);
  });

  it("guard catches diagnostic language from a model", () => {
    expect(findDiagnosticLanguage(["Pattern consistent with endometriosis"])).toBe("consistent with");
    expect(findDiagnosticLanguage(["“Dr said it's probably just bad periods”"])).toBeNull();
  });
});

describe("tag editing", () => {
  it("edits the underlying field", () => {
    const { fields } = extractLocal("Sharp pain low on my right side, about a 6, took ibuprofen", NOW);
    const sev = tagsFor(fields).find((t) => t.kind === "severity")!;
    expect(editTag(fields, sev, { type: "severity", value: 8 }).severity).toBe(8);
    const tx = tagsFor(fields).find((t) => t.kind === "treatment")!;
    expect(editTag(fields, tx, { type: "efficacy", value: "none" }).treatments[0].efficacy).toBe("none");
    const site = tagsFor(fields).find((t) => t.kind === "site")!;
    expect(editTag(fields, site, { type: "remove" }).site).toBeNull();
  });
});
