import Constants from "expo-constants";
import { useState } from "react";
import { Share, StyleSheet, Switch, TextInput, View } from "react-native";
import { RELAY_URL } from "../lib/config";
import { useJournal } from "../lib/journal";
import { scheduleReminder } from "../lib/reminders";
import { confirm, Divider, Row, Screen, Section, Segmented, T } from "../ui/components";
import { space, type, useColors } from "../ui/theme";

const HOURS = [
  { value: 8, label: "8 am" },
  { value: 13, label: "1 pm" },
  { value: 20, label: "8 pm" },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary }} />;
}

export default function SettingsScreen() {
  const j = useJournal();
  const c = useColors();
  const [name, setName] = useState(j.profile.name);
  const [dob, setDob] = useState(j.profile.dob);
  const [notice, setNotice] = useState<string | null>(null);
  const cloud = !!RELAY_URL && j.ai.ai;
  const input = [styles.input, { color: c.ink }];
  const saveProfile = () => void j.updateProfile({ name: name.trim(), dob: dob.trim() });

  const setReminder = async (enabled: boolean, hour = j.settings.reminder.hour) => {
    const scheduled = await scheduleReminder({ enabled, hour });
    if (enabled && !scheduled) {
      setNotice("Notifications are turned off for Medilog. You can allow them in your phone’s Settings.");
      return;
    }
    setNotice(null);
    await j.updateSettings({ reminder: { enabled, hour } });
  };

  return (
    <Screen safeTop={false}>
      <Section title="Reminders" footer={notice ?? "One gentle notification a day, scheduled on this phone."}>
        <Row icon="notifications-outline" title="Daily check-in" right={<Toggle value={j.settings.reminder.enabled} onChange={(v) => void setReminder(v)} />} />
        {j.settings.reminder.enabled && (
          <View style={styles.inCard}>
            <Segmented options={HOURS} value={j.settings.reminder.hour} onChange={(h) => void setReminder(true, h)} />
          </View>
        )}
      </Section>

      <Section
        title="Privacy"
        footer={
          (cloud
            ? `Cloud AI sends the text of each note, with names, numbers and places removed, to ${j.ai.processor ?? "the Medilog AI service"}. Nothing is stored there. `
            : "Notes are organised entirely on this phone. ") +
          (j.encrypted ? "Your journal is stored encrypted on this phone." : "This browser preview is not encrypted.")
        }
      >
        <Row
          icon="mic-outline"
          title="Keep voice on this phone"
          detail="Only use on-device speech recognition"
          right={<Toggle value={j.settings.requireOnDeviceSpeech} onChange={(v) => void j.updateSettings({ requireOnDeviceSpeech: v })} />}
        />
        {cloud && (
          <>
            <Divider inset={52} />
            <Row
              icon="sparkles-outline"
              title="Cloud AI for richer notes"
              detail="Off by default"
              right={<Toggle value={j.settings.cloudAi} onChange={(v) => void j.updateSettings({ cloudAi: v })} />}
            />
          </>
        )}
      </Section>

      <Section title="Your details" footer="Only printed on the summary you choose to share. Never sent for AI processing.">
        <TextInput style={input} placeholder="Your name" placeholderTextColor={c.muted} value={name} onChangeText={setName} onEndEditing={saveProfile} autoComplete="name" />
        <Divider />
        <TextInput style={input} placeholder="Date of birth (DD/MM/YYYY)" placeholderTextColor={c.muted} value={dob} onChangeText={setDob} onEndEditing={saveProfile} />
      </Section>

      <Section title="Emergency number" card={false}>
        <Segmented
          options={[
            { value: "AU", label: "Australia · 000" },
            { value: "US", label: "US · 911" },
          ]}
          value={j.settings.region}
          onChange={(region) => void j.updateSettings({ region })}
        />
      </Section>

      <Section title="Your data" footer="The export includes your notes and any appointment feedback. Only share it with people you trust, such as the study team.">
        <Row icon="share-outline" title="Export my data" onPress={() => void Share.share({ message: j.exportJson(), title: "Medilog export" })} />
        <Divider inset={52} />
        <Row
          icon="people-outline"
          title="Replace with sample patient"
          onPress={() => confirm("Load the sample patient?", "This replaces your current notes with 17 fictional ones.", "Replace", () => void j.loadSample())}
        />
        <Divider inset={52} />
        <Row
          icon="trash-outline"
          tone="danger"
          title="Delete all my data"
          onPress={() => confirm("Delete everything?", "Your journal and its encryption key will be erased from this phone. This can’t be undone.", "Delete", () => void j.wipeEverything())}
        />
      </Section>

      <T kind="caption" style={{ textAlign: "center" }}>
        Medilog {Constants.expoConfig?.version ?? ""} · beta · not a medical device{"\n"}In an emergency call {j.settings.region === "US" ? "911" : "000"}
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inCard: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  input: { paddingHorizontal: space.lg, paddingVertical: 15, ...type.body },
});
