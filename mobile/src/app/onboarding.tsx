import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useJournal } from "../lib/journal";
import { Button, Card, Checkbox, Divider, Icon, Screen, Section, Segmented, T, type IconName } from "../ui/components";
import { space, type, useColors } from "../ui/theme";

const POINTS: [IconName, string, string][] = [
  ["mic-outline", "Speak for ten seconds", "Say how you feel in your own words. Medilog asks one short follow-up at most."],
  ["time-outline", "It organises itself", "Your notes become a clear timeline. Correct anything with a tap."],
  ["document-text-outline", "Walk in prepared", "Get a one-minute opener for you and a one-page summary for your doctor."],
];

export default function Onboarding() {
  const { finishOnboarding, settings, updateSettings } = useJournal();
  const c = useColors();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [agreed, setAgreed] = useState(false);
  const input = [styles.input, { color: c.ink }];
  const emergency = settings.region === "US" ? "911" : "000";

  return (
    <Screen>
      <View style={{ gap: space.md, paddingTop: space.xl }}>
        <View style={[styles.mark, { backgroundColor: c.primary }]}>
          <Icon name="pulse" size={26} color={c.primaryInk} />
        </View>
        <T kind="largeTitle">Be heard at your next appointment.</T>
      </View>

      <View style={{ gap: space.xl }}>
        {POINTS.map(([icon, title, body]) => (
          <View key={title} style={{ flexDirection: "row", gap: space.lg }}>
            <View style={[styles.featureIcon, { backgroundColor: c.primarySoft }]}>
              <Icon name={icon} size={22} color={c.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T kind="headline">{title}</T>
              <T kind="secondary">{body}</T>
            </View>
          </View>
        ))}
      </View>

      <Card style={{ gap: space.lg }}>
        <View style={styles.note}>
          <Icon name="lock-closed-outline" size={20} color={c.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <T kind="headline" style={{ fontSize: 16 }}>
              Your journal stays on this phone
            </T>
            <T kind="caption">Stored encrypted on this device only. No account, no copy on our servers. Delete it any time.</T>
          </View>
        </View>
        <View style={styles.note}>
          <Icon name="medkit-outline" size={20} color={c.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <T kind="headline" style={{ fontSize: 16 }}>
              Medilog is not a doctor
            </T>
            <T kind="caption">It organises what you tell it. It never diagnoses or gives treatment advice. In an emergency, call {emergency}.</T>
          </View>
        </View>
      </Card>

      <Section title="For your doctor’s summary (optional)" footer="Only printed on the summary you choose to share. Never sent for AI processing.">
        <TextInput style={input} placeholder="Your name" placeholderTextColor={c.muted} value={name} onChangeText={setName} autoComplete="name" />
        <Divider />
        <TextInput style={input} placeholder="Date of birth (DD/MM/YYYY)" placeholderTextColor={c.muted} value={dob} onChangeText={setDob} />
      </Section>

      <Section title="Where are you?" card={false}>
        <Segmented
          options={[
            { value: "AU", label: "Australia" },
            { value: "US", label: "United States" },
          ]}
          value={settings.region}
          onChange={(region) => void updateSettings({ region })}
        />
      </Section>

      <View style={{ gap: space.lg }}>
        <Checkbox checked={agreed} onChange={setAgreed}>
          <T kind="callout" style={{ color: c.ink2 }}>
            I understand this is a test version, that Medilog does not give medical advice, and that I can delete my data at any time.
          </T>
        </Checkbox>
        <View style={{ gap: space.xs }}>
          <Button label="Start my journal" disabled={!agreed} onPress={() => void finishOnboarding({ name, dob, sample: false })} />
          <Button variant="plain" label="Explore with a sample patient instead" disabled={!agreed} onPress={() => void finishOnboarding({ name, dob, sample: true })} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mark: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  featureIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  note: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  input: { paddingHorizontal: space.lg, paddingVertical: 15, ...type.body },
});
