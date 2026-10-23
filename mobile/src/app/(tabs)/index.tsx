import Ionicons from "@expo/vector-icons/Ionicons";
import { applyPatch, entrySummary, processLog, type Entry, type FollowUpOption, type RedFlag } from "@medilog/engine";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useJournal } from "../../lib/journal";
import { useVoiceNote } from "../../lib/speech";
import { atLeast } from "../../lib/timing";
import { RedFlagModal } from "../../ui/RedFlagModal";
import { Button, Card, Choice, Header, Screen, T } from "../../ui/components";
import { radius, space, type, useColors } from "../../ui/theme";

type Phase = "idle" | "listening" | "typing" | "processing" | "result";

const greeting = (name: string) => {
  const h = new Date().getHours();
  const hello = h < 5 ? "Rough night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${hello}${name ? `, ${name.split(" ")[0]}` : ""}${h < 5 ? "?" : ""}`;
};

const today = () => new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

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

  // ------------------------------------------------------------ after a note

  if (phase === "processing") {
    return (
      <Screen>
        <View style={styles.centre}>
          <T kind="secondary" style={{ textAlign: "center", fontStyle: "italic" }} numberOfLines={4}>
            “{voice.transcript || draft}”
          </T>
          <ActivityIndicator color={c.primary} />
          <T kind="caption">Organising your note…</T>
        </View>
      </Screen>
    );
  }

  if (phase === "result" && entry) {
    const pending = entry.followUp && !entry.followUp.answer;
    if (pending) {
      return (
        <Screen>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Ionicons name="checkmark-circle" size={20} color={c.ok} />
            <T kind="label" style={{ color: c.ok }}>
              Noted
            </T>
          </View>
          <T kind="secondary" style={{ fontStyle: "italic" }} numberOfLines={3}>
            “{entry.rawText}”
          </T>
          <View style={{ gap: space.lg }}>
            <T kind="title">{entry.followUp!.question.replace(/^Logged\.\s*/, "")}</T>
            <View style={{ gap: space.sm }}>
              {entry.followUp!.options.map((o) => (
                <Choice key={o.label} label={o.label} onPress={() => answer(o)} />
              ))}
            </View>
            <Button variant="plain" label="Skip" onPress={() => answer(null)} />
          </View>
        </Screen>
      );
    }
    return (
      <Screen>
        <View style={styles.centre}>
          <View style={[styles.doneMark, { backgroundColor: c.primarySoft }]}>
            <Ionicons name="checkmark" size={34} color={c.primary} />
          </View>
          <T kind="title">Saved to your timeline</T>
          <T kind="secondary" style={{ textAlign: "center" }}>
            {entrySummary(entry.fields) || "Your note is saved."}
          </T>
        </View>
        <View style={{ gap: space.sm }}>
          <Button label="Log another" onPress={reset} />
          <Button variant="plain" label="See timeline" onPress={() => router.navigate("/timeline")} />
        </View>
        <T kind="caption" style={{ textAlign: "center" }}>
          {entry.engine === "claude" ? "Organised with Claude" : "Organised on this phone"} · stored encrypted on this phone
        </T>
      </Screen>
    );
  }

  // ------------------------------------------------------------ typing

  if (phase === "typing") {
    return (
      <Screen>
        <Header title="Write a note" settings={false} />
        <TextInput
          autoFocus
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. Woke at 3am with sharp pain low on my right side, took ibuprofen…"
          placeholderTextColor={c.muted}
          style={[styles.typer, { backgroundColor: c.card, color: c.ink }]}
        />
        {voice.error && <Notice text={voice.error} />}
        <View style={{ gap: space.sm }}>
          <Button label="Save note" disabled={!draft.trim()} onPress={() => void submit(draft, "text")} />
          <Button variant="plain" label="Cancel" onPress={() => setPhase("idle")} />
        </View>
      </Screen>
    );
  }

  // ------------------------------------------------------------ idle / listening

  const listening = phase === "listening";
  const voiceLine =
    mode === "on-device"
      ? { icon: "lock-closed" as const, text: "Voice is turned into text on this phone" }
      : mode === "platform"
        ? { icon: "cloud-outline" as const, text: `Voice uses ${Platform.OS === "ios" ? "Apple" : Platform.OS === "android" ? "Google" : "the browser's"} speech service` }
        : mode === "unavailable"
          ? { icon: "keypad-outline" as const, text: "Voice isn’t available, so you can type instead" }
          : null;

  return (
    <Screen>
      <Header title={greeting(j.profile.name)} subtitle={today()} />

      {j.vaultReset && <Notice text="Your previous journal couldn’t be unlocked on this phone, so a fresh one was started. Journals stay on the phone they were made on." />}

      <View style={styles.micZone}>
        <MicButton listening={listening} onPress={listening ? voice.stop : () => void startVoice()} />
        <T kind="headline" style={{ color: listening ? c.accent : c.ink }}>
          {listening ? "Listening… tap to finish" : "Tap and tell me how you feel"}
        </T>
        {listening ? (
          <T kind="title" style={{ textAlign: "center", color: voice.transcript ? c.ink : c.muted, minHeight: 60 }}>
            {voice.transcript || "Ten seconds is plenty."}
          </T>
        ) : (
          voiceLine && (
            <View style={styles.voiceLine}>
              <Ionicons name={voiceLine.icon} size={14} color={c.muted} />
              <T kind="caption">{voiceLine.text}</T>
            </View>
          )
        )}
      </View>

      {voice.error && !listening && <Notice text={voice.error} />}

      <View style={{ gap: space.xs }}>
        {listening ? (
          <Button
            variant="plain"
            label="Cancel"
            onPress={() => {
              voice.cancel();
              setPhase("idle");
            }}
          />
        ) : (
          <>
            <Button variant="plain" icon="create-outline" label="Type instead" onPress={() => setPhase("typing")} />
            {voice.plan?.downloadableLocale && Platform.OS === "android" && (
              <Button
                variant="plain"
                icon="download-outline"
                label={voice.downloading ? "Starting download…" : "Keep voice on this phone (download English)"}
                disabled={voice.downloading}
                onPress={() => void voice.downloadModel()}
              />
            )}
          </>
        )}
      </View>

      <RedFlagModal flag={flag} region={j.settings.region} onClose={() => setFlag(null)} />
    </Screen>
  );
}

function Notice({ text }: { text: string }) {
  const c = useColors();
  return (
    <Card style={{ backgroundColor: c.warnSoft, flexDirection: "row", gap: space.md }}>
      <Ionicons name="information-circle" size={20} color={c.warn} />
      <T kind="callout" style={{ flex: 1, color: c.ink }}>
        {text}
      </T>
    </Card>
  );
}

function MicButton({ listening, onPress }: { listening: boolean; onPress: () => void }) {
  const c = useColors();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!listening) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  const colour = listening ? c.accent : c.primary;
  return (
    <View style={styles.micWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          { backgroundColor: colour, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [listening ? 0.25 : 0.1, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }] },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={listening ? "Finish recording" : "Start recording"}
        onPress={onPress}
        style={({ pressed }) => [styles.mic, { backgroundColor: colour, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
      >
        {listening ? <View style={styles.stopGlyph} /> : <Ionicons name="mic" size={56} color="#fff" />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, minHeight: 320, alignItems: "center", justifyContent: "center", gap: space.md, paddingHorizontal: space.md },
  doneMark: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
  micZone: { alignItems: "center", gap: space.lg, paddingTop: space.xl, paddingBottom: space.md },
  micWrap: { width: 200, height: 200, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 160, height: 160, borderRadius: 80 },
  mic: { width: 148, height: 148, borderRadius: 74, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  stopGlyph: { width: 36, height: 36, borderRadius: 8, backgroundColor: "#fff" },
  voiceLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  typer: { minHeight: 180, borderRadius: radius.lg, padding: space.lg, ...type.body, fontSize: 18, lineHeight: 26, textAlignVertical: "top" },
});
