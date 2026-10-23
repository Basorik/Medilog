import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, useColorScheme, View } from "react-native";
import { JournalProvider, useJournal } from "../lib/journal";
import { useColors } from "../ui/theme";

function RootStack() {
  const { ready, settings } = useJournal();
  const c = useColors();
  if (!ready)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Protected guard={settings.onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="settings"
          options={{
            presentation: "modal",
            headerShown: true,
            title: "Settings",
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.primary,
            headerTitleStyle: { color: c.ink, fontWeight: "600" },
            headerShadowVisible: false,
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!settings.onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, primary: c.primary, background: c.bg, card: c.bg, text: c.ink, border: c.line } }}>
      <JournalProvider>
        <StatusBar style="auto" />
        <RootStack />
      </JournalProvider>
    </ThemeProvider>
  );
}
