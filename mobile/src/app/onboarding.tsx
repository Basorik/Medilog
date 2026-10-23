import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useJournal } from "../lib/journal";
import { Button, Card, Screen, T } from "../ui/components";
import { radius, space, useColors } from "../ui/theme";

const POINTS = [
  ["🎙", "Speak for ten seconds", "Describe how you feel in your own words. Medilog asks one short follow-up question at most."],
  ["🗂", "It organises itself", "Your notes become a clear timeline. You can correct anything with a tap."],
  ["🩺", "Walk in prepared", "Before an appointment, get a one-minute opener for you and a one-page summary for your doctor."],
] as const;

export default function Onboarding() {
  const { finishOnboarding, settings, updateSettings } = useJournal();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [agreed, setAgreed] = useState(false);
  const input = [styles.input, { borderColor: c.line, backgroundColor: c.surface, color: c.ink }];

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
      <Screen>
        <View style={{ gap: space.sm, paddingTop: space.lg }}>
          <T kind="eyebrow" style={{ color: c.primary }}>
            Medilog · beta
          </T>
          <T kind="title">Be heard at your next appointment.</T>
        </View>

        {POINTS.map(([emoji, title, body]) => (
          <View key={title} style={{ flexDirection: "row", gap: space.md }}>
            <Text style={{ fontSize: 26 }}>{emoji}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <T style={{ fontWeight: "700" }}>{title}</T>
              <T kind="muted">{body}</T>
            </View>
          </View>
        ))}

        <Card style={{ backgroundColor: c.primarySoft, borderColor: c.primarySoft }}>
          <T style={{ fontWeight: "700" }}>🔒 Your journal stays on this phone</T>
          <T kind="small">
            Entries are stored encrypted on this device only. There is no Medilog account and no copy on our servers. Voice is turned into text on the
            phone wherever it supports that. Deleting the app, or using “Delete all my data”, erases everything.
          </T>
        </Card>

        <Card style={{ backgroundColor: c.accentSoft, borderColor: c.accentSoft }}>
          <T style={{ fontWeight: "700" }}>Medilog is not a doctor</T>
          <T kind="small">
            It organises what you tell it. It never diagnoses or gives treatment advice, and it is not for emergencies. If you feel seriously unwell,
            call {settings.region === "US" ? "911" : "000"}.
          </T>
        </Card>

        <View style={{ gap: space.sm }}>
          <T kind="eyebrow">For your doctor’s summary (optional)</T>
          <TextInput style={input} placeholder="Your name" placeholderTextColor={c.muted} value={name} onChangeText={setName} autoComplete="name" />
          <TextInput style={input} placeholder="Date of birth (DD/MM/YYYY)" placeholderTextColor={c.muted} value={dob} onChangeText={setDob} />
          <T kind="small" style={{ color: c.muted }}>
            Only printed on the one-pager you choose to share. It is removed before anything could ever be sent for AI processing.
          </T>
        </View>

        <View style={{ flexDirection: "row", gap: space.sm }}>
          {(["AU", "US"] as const).map((r) => (
            <Pressable
              key={r}
              onPress={() => void updateSettings({ region: r })}
              style={[styles.region, { borderColor: settings.region === r ? c.primary : c.line, backgroundColor: settings.region === r ? c.primarySoft : c.surface }]}
            >
              <Text style={{ color: c.ink, fontWeight: "600" }}>{r === "AU" ? "🇦🇺 Australia" : "🇺🇸 United States"}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => setAgreed(!agreed)} style={{ flexDirection: "row", gap: space.md, alignItems: "center" }} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
          <Switch value={agreed} onValueChange={setAgreed} trackColor={{ true: c.primary }} />
          <T kind="small" style={{ flex: 1 }}>
            I understand this is a test version, that Medilog does not give medical advice, and that I can delete my data at any time.
          </T>
        </Pressable>

        <Button label="Start my journal" disabled={!agreed} onPress={() => void finishOnboarding({ name, dob, sample: false })} />
        <Button kind="link" label="Explore with a sample patient instead" disabled={!agreed} onPress={() => void finishOnboarding({ name, dob, sample: true })} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  region: { flex: 1, borderWidth: 1.5, borderRadius: radius.md, padding: space.md, alignItems: "center" },
});
