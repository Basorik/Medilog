// Choosing which English to ask the speech recogniser for. Pure, so it can be checked without a phone.

const ENGLISH_PREFERENCE = ["en-AU", "en-GB", "en-US"];

export function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return "en-AU";
  }
}

/** Android reports locales as "en-AU" or "en_AU"; compare them loosely. */
export const norm = (l: string) => l.replace("_", "-").toLowerCase();

/** The user's own English first, then Australian, British and US English. */
export function pickEnglish(candidates: string[]): string | null {
  const have = new Map(candidates.map((l) => [norm(l), l]));
  const device = deviceLocale();
  for (const want of [device, ...ENGLISH_PREFERENCE]) {
    if (!norm(want).startsWith("en")) continue;
    const hit = have.get(norm(want));
    if (hit) return hit;
  }
  return candidates.find((l) => norm(l).startsWith("en")) ?? null;
}
