import Ionicons from "@expo/vector-icons/Ionicons";
import { EMERGENCY, type RedFlag } from "@medilog/engine";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Full-screen emergency interrupt. Triggered by fixed on-device rules, never by AI.

export function RedFlagModal({ flag, region, onClose }: { flag: RedFlag | null; region: "AU" | "US"; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!flag) return null;
  const em = EMERGENCY[region];
  const call = (n: string) => void Linking.openURL(`tel:${n}`);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={[styles.wrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]} accessibilityRole="alert">
        <View style={styles.icon}>
          <Ionicons name="warning" size={36} color="#fff" />
        </View>
        <Text style={styles.title}>{flag.title}</Text>
        {flag.crisis ? (
          <Text style={styles.body}>
            What you’re describing matters, and you don’t have to handle it alone. Please talk to someone now: call {em.crisisLine}, or {em.number} if you
            are in immediate danger.
          </Text>
        ) : (
          <Text style={styles.body}>
            What you’ve described can be a medical emergency. Call {em.number} now. Don’t drive yourself, and don’t wait to see if it passes.
          </Text>
        )}
        <Pressable accessibilityRole="button" style={styles.call} onPress={() => call(flag.crisis ? em.crisisTel : em.number)}>
          <Ionicons name="call" size={20} color="#9f1d25" />
          <Text style={styles.callText}>Call {flag.crisis ? em.crisisLine : em.number}</Text>
        </Pressable>
        {flag.crisis && (
          <Pressable accessibilityRole="button" style={[styles.call, styles.outline]} onPress={() => call(em.number)}>
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={[styles.callText, { color: "#fff" }]}>Call {em.number}</Text>
          </Pressable>
        )}
        <Text style={styles.note}>This is a fixed safety rule, not an AI judgement. Your note was saved and marked so your doctor can see it.</Text>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
          <Text style={styles.dismiss}>I’m safe: return to the app</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#9f1d25", paddingHorizontal: 24, justifyContent: "center", gap: 18 },
  icon: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.16)", alignSelf: "center", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 28, lineHeight: 34, fontWeight: "700", textAlign: "center" },
  body: { color: "#fff", fontSize: 17, lineHeight: 24, textAlign: "center" },
  call: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 16, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  outline: { backgroundColor: "transparent", borderWidth: 2, borderColor: "#fff" },
  callText: { color: "#9f1d25", fontSize: 19, fontWeight: "700" },
  note: { color: "rgba(255,255,255,0.85)", fontSize: 13, textAlign: "center" },
  dismiss: { color: "#fff", textAlign: "center", fontWeight: "600", fontSize: 16, paddingVertical: 8 },
});
