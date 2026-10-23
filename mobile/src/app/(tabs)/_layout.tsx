import { Link } from "expo-router";
import { Tabs } from "expo-router/tabs";
import { Pressable, Text } from "react-native";
import { useColors } from "../../ui/theme";

const icon = (glyph: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.line },
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTintColor: c.ink,
        headerTitleStyle: { fontWeight: "700" },
        headerRight: () => (
          <Link href="/settings" asChild>
            <Pressable accessibilityLabel="Settings" hitSlop={12} style={{ paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 20, color: c.ink2 }}>⚙︎</Text>
            </Pressable>
          </Link>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Log", headerTitle: "Medilog", tabBarIcon: icon("🎙") }} />
      <Tabs.Screen name="timeline" options={{ title: "Timeline", tabBarIcon: icon("🗂") }} />
      <Tabs.Screen name="appointment" options={{ title: "Appointment", tabBarIcon: icon("🩺") }} />
    </Tabs>
  );
}
