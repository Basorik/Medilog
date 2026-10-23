import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/tabs";
import type { ComponentProps } from "react";
import { Platform, StyleSheet } from "react-native";
import { useColors } from "../../ui/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const icon = (on: IconName, off: IconName) =>
  function TabIcon({ focused }: { focused: boolean }) {
    const c = useColors();
    return <Ionicons name={focused ? on : off} size={22} color={focused ? c.primary : c.muted} />;
  };

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
        // The web preview has no safe-area inset, so give the label room under the icon font's line box.
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.line, borderTopWidth: StyleSheet.hairlineWidth, ...(Platform.OS === "web" && { height: 58 }) },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Log", tabBarIcon: icon("mic", "mic-outline") }} />
      <Tabs.Screen name="timeline" options={{ title: "Timeline", tabBarIcon: icon("time", "time-outline") }} />
      <Tabs.Screen name="appointment" options={{ title: "Appointment", tabBarIcon: icon("document-text", "document-text-outline") }} />
    </Tabs>
  );
}
