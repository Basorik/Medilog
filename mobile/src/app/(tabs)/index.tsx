import { applyPatch, coverage, processLog, tagsFor, type Entry, type FollowUpOption, type RedFlag, type SlotKey } from "@medilog/engine";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useJournal } from "../../lib/journal";
import { useVoiceNote } from "../../lib/speech";
import { atLeast } from "../../lib/timing";
import { RedFlagModal } from "../../ui/RedFlagModal";
import { Badge, Button, Card, Pill, Row, Screen, T, TagChip } from "../../ui/components";
import { radius, space, useColors } from "../../ui/theme";

const SLOTS: { key: SlotKey; label: string }[] = [
  { key: "site", label: "Site" },
  { key: "onset", label: "Onset" },
  { key: "character", label: "Character" },
  { key: "radiation", label: "Radiation" },
  { key: "associated", label: "Associated" },
  { key: "timing", label: "Timing" },
  { key: "modifiers", label: "Modifiers" },
  { key: "severity", label: "Severity" },
  { key: "function", label: "Function" },
  { key: "relief", label: "Relief" },
];

type Phase = "idle" | "listening" | "typing" | "processing" | "result";

const greeting = (name: string) => {
  const h = new Date().getHours();
  const hello = h < 5 ? "Rough night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${hello}${name ? `, ${name.split(" ")[0]}` : ""}${h < 5 ? "?" : "."}`;
};

export default function LogScreen() {
  const j = useJournal();
  const c = useColors();
  const voice = useVoiceNote(j.settings.requireOnDeviceSpeech);
  const mode = voice.plan?.mode;
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState("");
  const [entry, setEntry] = useState<Entry | null>(null);
  const [flag, setFlag] = useState<RedFlag | null>(null);
  const busy = useRef(false);

  const submit = useCallback(
    async (text: string, source: "voice" | "text") => {
      if (!text.trim() || busy.current) {
        setPhase("idle");
        return;
      }
      busy.current = true;
      setPhase("processing");
      const now = new Date();
      const out = await atLeast(900, () =>
        processLog(text.trim(), { now, entries: j.entries, profile: j.profile, useCloud: j.useCloud, models: j.ai.models, source }, () => undefined),
      );
      const e: Entry = {
        id: Crypto.randomUUID(),
        createdAt: now.toISOString(),
        rawText: text.trim(),
        fields: out.result.fields,
        followUp: out.redFlag ? null : out.result.followUp,
        redFlag: out.redFlag,
        source,
        engine: out.engine,
        editedTags: [],
      };
      await j.saveEntry(e);
      busy.current = false;
      setDraft("");
      if (out.redFlag) {
        if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setFlag(out.redFlag);
        setPhase("idle");
        return;
      }
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEntry(e);
      setPhase("result");
    },
    [j],
  );

  const answer = (option: FollowUpOption | null) => {
    if (!entry) return;
    const next: Entry = {
      ...entry,
      fields: option ? applyPatch(entry.fields, option.patch) : entry.fields,
      followUp: entry.followUp ? { ...entry.followUp, answer: option?.label ?? "Skipped" } : null,
    };
    setEntry(next);
    void j.saveEntry(next);
  };

  const startVoice = async () => {
    const started = await voice.start((text) => void submit(text, "voice"));
    setPhase(started ? "listening" : "typing");
  };

  const reset = () => {
    setEntry(null);
    setPhase("idle");
  };

  if (phase === "processing" || (phase === "result" && entry)) {
    const cov = entry ? coverage(entry.fields) : null;
    const asking = new Set(entry?.followUp && !entry.followUp.answer ? entry.followUp.targets : []);
    const captured = cov ? SLOTS.filter((s) => cov[s.key]).length : 0;
    const pending = entry?.followUp && !entry.followUp.answer;
    return (
      <Screen>
        <View style={[styles.bubble, { backgroundColor: c.primarySoft }]}>
          <T kind="eyebrow" style={{ color: c.primary }}>
            You said
          </T>
          <T>{entry?.rawText ?? (voice.transcript || draft)}</T>
        </View>
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T kind="small" style={{ fontWeight: "600" }}>
              {entry ? `${captured} of ${SLOTS.length} clinical details captured` : "Organising your note…"}
            </T>
            {entry ? <Badge label={entry.engine === "claude" ? "✨ Claude" : "⚙︎ On-device"} tone={entry.engine === "claude" ? "ai" : "local"} /> : <ActivityIndicator color={c.primary} />}
          </View>
          <View style={styles.slots}>
            {SLOTS.map((s) => {
              const on = !!cov?.[s.key];
              const ask = asking.has(s.key);
              return (
                <View
                  key={s.key}
                  style={[
                    styles.slot,
                    { borderColor: ask ? c.warn : on ? c.primarySoft : c.line, backgroundColor: ask ? c.warnSoft : on ? c.primarySoft : "transparent" },
                  ]}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: ask ? c.warn : on ? c.primary : c.muted }}>{s.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {entry && (
          <>
            <Row gap={6}>
              {tagsFor(entry.fields).map((t) => (
                <TagChip key={t.key} tag={t} />
              ))}
            </Row>
            {pending ? (
              <Card style={{ gap: space.md }}>
                <T style={{ fontSize: 18, fontWeight: "600", lineHeight: 24 }}>{entry.followUp!.question}</T>
                <Row>
                  {entry.followUp!.options.map((o) => (
                    <Pill key={o.label} label={o.label} onPress={() => answer(o)} />
                  ))}
                </Row>
                <Button kind="link" label="Skip" onPress={() => answer(null)} style={{ alignSelf: "flex-start" }} />
              </Card>
            ) : (
              <View style={{ gap: space.md }}>
                <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                  <View style={[styles.done, { backgroundColor: c.ok }]}>
                    <Text style={{ color: "#fff", fontWeight: "800" }}>✓</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontWeight: "700" }}>Saved to your timeline</T>
                    <T kind="small">Encrypted on this phone. Tap any tag in the timeline to correct it.</T>
                  </View>
                </View>
                <Button label="Log another" onPress={reset} />
              </View>
            )}
          </>
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <T kind="eyebrow">{new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</T>
        <T kind="title">{greeting(j.profile.name)}</T>
        <T kind="muted">Tell me what’s going on, in your own words. Ten seconds is plenty.</T>
      </View>

      {j.vaultReset && (
        <Card style={{ borderColor: c.warn }}>
          <T kind="small">Your previous journal couldn’t be unlocked on this phone, so a fresh one was started. Journals are tied to the phone they were made on.</T>
        </Card>
      )}

      {phase === "typing" ? (
        <View style={{ gap: space.sm }}>
          <TextInput
            autoFocus
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder="e.g. Woke at 3am with sharp pain low on my right side, took ibuprofen…"
            placeholderTextColor={c.muted}
            style={[styles.typer, { borderColor: c.line, backgroundColor: c.surface, color: c.ink }]}
          />
          {voice.error && <T kind="small" style={{ color: c.warn }}>{voice.error}</T>}
          <Row style={{ justifyContent: "flex-end" }}>
            <Button kind="ghost" label="Cancel" onPress={() => setPhase("idle")} />
            <Button label="Log it" disabled={!draft.trim()} onPress={() => void submit(draft, "text")} />
          </Row>
        </View>
      ) : (
        <View style={{ alignItems: "center", gap: space.md, paddingVertical: space.xl }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={phase === "listening" ? "Finish recording" : "Start recording"}
            onPress={phase === "listening" ? voice.stop : () => void startVoice()}
            style={({ pressed }) => [
              styles.mic,
              { backgroundColor: phase === "listening" ? c.accent : c.primary, transform: [{ scale: pressed ? 0.96 : 1 }] },
            ]}
          >
            {phase === "listening" ? <View style={styles.stopGlyph} /> : <Text style={{ fontSize: 46 }}>🎙</Text>}
          </Pressable>
          <T style={{ fontWeight: "600", color: c.ink2 }}>{phase === "listening" ? "Listening · tap to finish" : "Tap and speak"}</T>
          {phase === "listening" && <T style={{ textAlign: "center", fontSize: 18, minHeight: 50 }}>{voice.transcript || "…"}</T>}
          {phase === "listening" ? (
            <Button
              kind="link"
              label="Cancel"
              onPress={() => {
                voice.cancel();
                setPhase("idle");
              }}
            />
          ) : (
            <Button kind="link" label="or type it instead" onPress={() => setPhase("typing")} />
          )}
          {phase === "idle" && mode && (
            <Badge
              tone={mode === "on-device" ? "ok" : "local"}
              label={
                mode === "on-device"
                  ? "🔒 Voice is transcribed on this phone"
                  : mode === "platform"
                    ? `Voice uses ${Platform.OS === "ios" ? "Apple" : Platform.OS === "android" ? "Google" : "the browser's"} speech service`
                    : "Voice unavailable: type instead"
              }
            />
          )}
          {phase === "idle" && voice.plan?.downloadableLocale && Platform.OS === "android" && (
            <Button
              kind="link"
              label={voice.downloading ? "Starting download…" : "Download on-device English so voice stays on this phone"}
              disabled={voice.downloading}
              onPress={() => void voice.downloadModel()}
            />
          )}
          {voice.error && phase === "idle" && <T kind="small" style={{ color: c.warn, textAlign: "center" }}>{voice.error}</T>}
        </View>
      )}

      <RedFlagModal flag={flag} region={j.settings.region} onClose={() => setFlag(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: 18, borderBottomLeftRadius: 6, padding: space.md, gap: 4 },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  slot: { width: "18.5%", borderWidth: 1, borderRadius: radius.sm, paddingVertical: 6, alignItems: "center" },
  done: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  mic: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0e6b63",
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  stopGlyph: { width: 34, height: 34, borderRadius: 6, backgroundColor: "#fff" },
  typer: { minHeight: 120, borderWidth: 1, borderRadius: radius.md, padding: space.md, fontSize: 16, textAlignVertical: "top" },
});
