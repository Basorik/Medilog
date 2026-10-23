import { useColorScheme, type TextStyle } from "react-native";

// Calm, low-contrast surfaces with one brand colour. Cards sit on the page by
// tone, not borders; colour is reserved for actions and meaning.

const light = {
  bg: "#F6F5F2",
  card: "#FFFFFF",
  fill: "#EEECE7",
  line: "#E4E1DA",
  ink: "#1C1B1F",
  ink2: "#46444C",
  muted: "#76737C",
  primary: "#0E6B63",
  primaryInk: "#FFFFFF",
  primarySoft: "#E2F0EC",
  accent: "#D45B47",
  accentSoft: "#FBE6E1",
  warn: "#9A5E00",
  warnSoft: "#FAEED6",
  danger: "#B4232C",
  ok: "#1F7A4D",
};

const dark: typeof light = {
  bg: "#111113",
  card: "#1C1C1F",
  fill: "#27272B",
  line: "#2F2F34",
  ink: "#F2F1F4",
  ink2: "#CFCDD4",
  muted: "#9A97A1",
  primary: "#45B8AA",
  primaryInk: "#06201C",
  primarySoft: "#16312D",
  accent: "#EF8572",
  accentSoft: "#3A221D",
  warn: "#E5B04F",
  warnSoft: "#36290F",
  danger: "#F27A80",
  ok: "#62C58C",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 };

export const type: Record<"largeTitle" | "title" | "headline" | "body" | "callout" | "caption" | "label", TextStyle> = {
  largeTitle: { fontSize: 32, lineHeight: 38, fontWeight: "700", letterSpacing: -0.6 },
  title: { fontSize: 21, lineHeight: 27, fontWeight: "650" as TextStyle["fontWeight"], letterSpacing: -0.2 },
  headline: { fontSize: 17, lineHeight: 23, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 23 },
  callout: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
};
