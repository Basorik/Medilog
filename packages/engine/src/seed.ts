import { applyPatch, extractFields, extractLocal, type PriorContext } from "./extract";
import { screenRedFlags } from "./redflags";
import type { Entry, Profile } from "./types";

// A fictional demo persona: recurrent right-sided pelvic pain, the classic
// "it's probably just bad periods" story. Every entry below is run through the
// real on-device engine, so the seeded timeline is exactly what the app would
// have produced if these notes had been dictated.

interface SeedNote {
  daysAgo: number;
  time: string;
  text: string;
  /** Which follow-up pill the persona tapped (matched by label prefix). */
  answer?: string;
}

export const SEED_NOTES: SeedNote[] = [
  { daysAgo: 66, time: "07:50", text: "Period started. Cramping in my lower belly, about a 7. Ibuprofen barely helped.", answer: "None of these" },
  { daysAgo: 52, time: "02:50", text: "Woke at 3am, sharp pain lower right side, 6 out of 10. Heat pack helped a little.", answer: "None of these" },
  { daysAgo: 41, time: "03:00", text: "Woke at 3 with sharp cramps low on my right side, about a 7. Period is due.", answer: "None of these" },
  { daysAgo: 38, time: "08:10", text: "Period started, cramping really bad on my lower right side, 8/10. Two Nurofen, didn't help. Stayed in bed.", answer: "Nausea" },
  { daysAgo: 37, time: "03:40", text: "Up at 3:40 with stabbing right pelvic pain again, 7/10. Panadol did nothing. Called in sick.", answer: "None of these" },
  { daysAgo: 25, time: "02:50", text: "Sharp stabbing pain low on my right side woke me up around 3. Maybe a 6. Took ibuprofen.", answer: "Barely helped" },
  { daysAgo: 24, time: "14:20", text: "Still that dull ache in my right pelvis, worse when I walk fast. Left work early.", answer: "Moderate" },
  { daysAgo: 19, time: "02:30", text: "Woke up bloated and crampy, lower belly, about a 4. Heat pack helped a bit.", answer: "1–4 hours" },
  { daysAgo: 13, time: "03:05", text: "Woke at 3am with that cramping in my lower right side again, really bad, 8 out of 10. Two ibuprofen and the heat pack.", answer: "Didn't help" },
  { daysAgo: 12, time: "07:40", text: "Period started. Pain is the worst it's been, sharp and radiating down my right thigh. Couldn't go to work.", answer: "Lower right" },
  { daysAgo: 11, time: "03:30", text: "Up at 3:30 again with stabbing right sided pelvic pain, 8/10, felt nauseous. Ibuprofen didn't touch it.", answer: "1–4 hours" },
  { daysAgo: 10, time: "15:00", text: "Called in sick again. Cramping all day, 7 out of 10, hurts when I go to the toilet.", answer: "Lower right" },
  { daysAgo: 9, time: "02:40", text: "Woke up with sharp pain in my right lower abdomen, about a 7. Took naproxen this time.", answer: "Barely helped" },
  { daysAgo: 8, time: "21:10", text: "Pain eased a little, maybe a 5, but I'm exhausted. Cancelled dinner with my partner Sam.", answer: "Most of the day" },
  { daysAgo: 6, time: "03:15", text: "3am again, cramping lower right side, 6/10. Heat pack and ibuprofen.", answer: "Barely helped" },
  {
    daysAgo: 3,
    time: "18:45",
    text: "Dull ache in my pelvis on the right, about a 4. Booked with Dr Patel at Northside Women's Clinic, call them on 02 9123 4567. Dr Patel said last time it's probably just bad periods.",
    answer: "None of these",
  },
  { daysAgo: 1, time: "03:20", text: "Woke at 3 with that sharp right-sided cramping again, 7 out of 10. Took two ibuprofen, didn't really help. Missed my morning shift.", answer: "None of these" },
];

export const DEMO_PROFILE = (now: Date): Profile => ({
  name: "Maya Thompson",
  dob: "14/03/1994",
  email: "maya.thompson@example.com",
  phone: "0412 345 678",
  lastConsult: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 33, 10, 30).toISOString(),
  region: "AU",
});

export const BLANK_PROFILE: Profile = { name: "", dob: "", email: "", phone: "", lastConsult: null, region: "AU" };

const at = (now: Date, daysAgo: number, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m);
};

export function buildSeedEntries(now: Date = new Date()): Entry[] {
  let prior: PriorContext | undefined;
  return SEED_NOTES.map((note, i) => {
    const createdAt = at(now, note.daysAgo, note.time);
    const { fields, followUp } = extractLocal(note.text, createdAt, prior);
    const option = note.answer ? followUp?.options.find((o) => o.label.startsWith(note.answer!)) : undefined;
    const region = extractFields(note.text, createdAt, prior).region;
    const finalFields = option ? applyPatch(fields, option.patch) : fields;
    prior = { region, site: finalFields.site };
    return {
      id: `seed-${i}`,
      createdAt: createdAt.toISOString(),
      rawText: note.text,
      fields: finalFields,
      followUp: followUp ? { ...followUp, answer: option?.label } : null,
      redFlag: screenRedFlags(note.text),
      source: "seed",
      engine: "local",
      editedTags: [],
    } satisfies Entry;
  });
}
