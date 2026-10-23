import { useColorScheme } from "react-native";

// Same palette as the web demo, so screenshots and the investor demo match.

const light = {
  bg: "#fbfaf7",
  surface: "#ffffff",
  surface2: "#f3f1ec",
  line: "#e2ded5",
  ink: "#1d1c20",
  ink2: "#4a4851",
  muted: "#77747d",
  primary: "#0e6b63",
  primaryInk: "#ffffff",
  primarySoft: "#dcefeb",
  accent: "#d9604c",
  accentSoft: "#fbe5df",
  ai: "#5a49c9",
  aiSoft: "#ebe8fb",
  warn: "#a96a00",
  warnSoft: "#fbefd6",
  danger: "#b4232c",
  ok: "#217a45",
};

const dark: typeof light = {
  bg: "#121215",
  surface: "#1b1b1f",
  surface2: "#242429",
  line: "#34333a",
  ink: "#f1f0f3",
  ink2: "#c9c7ce",
  muted: "#9b98a3",
  primary: "#3fb5a8",
  primaryInk: "#08201d",
  primarySoft: "#173733",
  accent: "#f08371",
  accentSoft: "#3b211d",
  ai: "#a99cf6",
  aiSoft: "#2a2545",
  warn: "#e7b04d",
  warnSoft: "#3a2d12",
  danger: "#f2727a",
  ok: "#66c98d",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
