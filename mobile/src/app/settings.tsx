import Constants from "expo-constants";
import { useState } from "react";
import { Share, StyleSheet, Switch, TextInput, View } from "react-native";
import { RELAY_URL } from "../lib/config";
import { useJournal } from "../lib/journal";
import { scheduleReminder } from "../lib/reminders";
import { Button, Card, confirm, Pill, Row, Screen, T } from "../ui/components";
import { radius, space, useColors } from "../ui/theme";

const HOURS = [
  [8, "8 am"],
  [13, "1 pm"],
  [20, "8 pm"],
] as const;

function Toggle({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ fontWeight: "600" }}>{label}</T>
        <T kind="small" style={{ color: c.muted }}>
          {detail}
        </T>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary }} />
    </View>
  );
}

export default function SettingsScreen() {
  const j = useJournal();
  const c = useColors();
  const [name, setName] = useState(j.profile.name);
  const [dob, setDob] = useState(j.profile.dob);
  const [notice, setNotice] = useState<string | null>(null);
  const input = [styles.input, { borderColor: c.line, backgroundColor: c.surface, color: c.ink }];

  const setReminder = async (enabled: boolean, hour = j.settings.reminder.hour) => {
    const scheduled = await scheduleReminder({ enabled, hour });
    if (enabled && !scheduled) {
      setNotice("Notifications are turned off for Medilog. You can allow them in your phone's Settings.");
      return;
    }
    setNotice(null);
    await j.updateSettings({ reminder: { enabled, hour } });
  };

  return (
    <Screen>
      <Card>
        <T kind="eyebrow">Daily reminder</T>
        <Toggle
          label="Remind me to check in"
          detail="One gentle notification a day, scheduled on this phone."
          value={j.settings.reminder.enabled}
          onChange={(v) => void setReminder(v)}
        />
        {j.settings.reminder.enabled && (
          <Row gap={6}>
            {HOURS.map(([h, label]) => (
              <Pill key={h} tone="neutral" label={label} on={j.settings.reminder.hour === h} onPress={() => void setReminder(true, h)} />
            ))}
          </Row>
        )}
        {notice && (
          <T kind="small" style={{ color: c.warn }}>
            {notice}
          </T>
        )}
      </Card>

      <Card>
        <T kind="eyebrow">Privacy</T>
        <Toggle
          label="Voice never leaves this phone"
          detail="Only use on-device speech recognition. On Android, the Log screen offers to download the English model if it's missing; otherwise you'll type instead."
          value={j.settings.requireOnDeviceSpeech}
          onChange={(v) => void j.updateSettings({ requireOnDeviceSpeech: v })}
        />
        {RELAY_URL && j.ai.ai ? (
          <Toggle
            label="Use cloud AI for richer notes"
            detail={`Sends the text of each note, with names, numbers and places removed, to ${j.ai.processor ?? "the Medilog AI service"} for AI structuring. Nothing is stored there. If it can't help with a note, the phone organises it instead. Off by default.`}
            value={j.settings.cloudAi}
            onChange={(v) => void j.updateSettings({ cloudAi: v })}
          />
        ) : (
          <T kind="small" style={{ color: c.muted }}>
            Notes are organised entirely on this phone. Nothing you log is sent anywhere.
          </T>
        )}
        <T kind="small" style={{ color: c.muted }}>
          Storage: {j.encrypted ? "encrypted on this device (SQLCipher, key in the secure keychain)" : "browser preview, not encrypted"}.
        </T>
      </Card>

      <Card>
        <T kind="eyebrow">For your doctor’s summary</T>
        <TextInput style={input} placeholder="Your name" placeholderTextColor={c.muted} value={name} onChangeText={setName} />
        <TextInput style={input} placeholder="Date of birth (DD/MM/YYYY)" placeholderTextColor={c.muted} value={dob} onChangeText={setDob} />
        <Button kind="ghost" label="Save" onPress={() => void j.updateProfile({ name: name.trim(), dob: dob.trim() })} />
        <T kind="eyebrow" style={{ marginTop: space.sm }}>
          Emergency number
        </T>
        <Row gap={6}>
          <Pill tone="neutral" label="Australia · 000" on={j.settings.region === "AU"} onPress={() => void j.updateSettings({ region: "AU" })} />
          <Pill tone="neutral" label="US · 911" on={j.settings.region === "US"} onPress={() => void j.updateSettings({ region: "US" })} />
        </Row>
      </Card>

      <Card>
        <T kind="eyebrow">Your data</T>
        <Button kind="ghost" label="Export my data (JSON)" onPress={() => void Share.share({ message: j.exportJson(), title: "Medilog export" })} />
        <T kind="small" style={{ color: c.muted }}>
          Includes your notes and any appointment feedback. Only share it with people you trust, such as the study team.
        </T>
        <Button
          kind="ghost"
          label="Replace with sample patient"
          onPress={() => confirm("Load the sample patient?", "This replaces your current entries with 17 fictional ones.", "Replace", () => void j.loadSample())}
        />
        <Button
          kind="danger"
          label="Delete all my data"
          onPress={() =>
            confirm("Delete everything?", "Your journal and its encryption key will be erased from this phone. This can't be undone.", "Delete", () => void j.wipeEverything())
          }
        />
      </Card>

      <T kind="small" style={{ color: c.muted, textAlign: "center" }}>
        Medilog {Constants.expoConfig?.version ?? ""} · beta · not a medical device. In an emergency call {j.settings.region === "US" ? "911" : "000"}.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 11, fontSize: 16 },
});
