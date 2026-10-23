import { fmtDate, generateReport, makeRange, type RangeKey, type Report } from "@medilog/engine";
import * as Speech from "expo-speech";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useJournal, type Feedback } from "../../lib/journal";
import { atLeast } from "../../lib/timing";
import { shareOnePagerPdf, shareOnePagerText } from "../../lib/share";
import { Badge, Button, Card, Pill, Row, Screen, T } from "../../ui/components";
import { radius, space, useColors } from "../../ui/theme";

export default function AppointmentScreen() {
  const j = useJournal();
  const c = useColors();
  const [range, setRange] = useState<RangeKey>("30d");
  // A report is only shown for the logs and timeframe it was made from.
  const [made, setReport] = useState<{ report: Report; entries: unknown; range: RangeKey } | null>(null);
  const report = made && made.entries === j.entries && made.range === range ? made.report : null;
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"script" | "doctor">("script");
  const [speaking, setSpeaking] = useState(false);
  const now = new Date();
  const keys: RangeKey[] = j.profile.lastConsult ? ["7d", "30d", "90d", "since-consult"] : ["7d", "30d", "90d"];
  const r = makeRange(range, now, j.profile.lastConsult);
  const inRange = j.entries.filter((e) => new Date(e.createdAt) >= r.start).length;

  useEffect(() => () => void Speech.stop(), []);

  const prepare = async () => {
    setBusy(true);
    const out = await atLeast(1200, () => generateReport(j.entries, r, { profile: j.profile, useCloud: j.useCloud, models: j.ai.models }, () => undefined));
    setReport({ report: out, entries: j.entries, range });
    setView("script");
    setBusy(false);
  };

  const speak = () => {
    if (!report) return;
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(report.soapbox.join(" "), { language: "en-AU", rate: 0.95, onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false) });
  };

  return (
    <Screen>
      <T kind="muted">Turn your logs into a 60-second opener for you, and a one-page history for your doctor.</T>
      <Row gap={6}>
        {keys.map((k) => (
          <Pill key={k} tone="neutral" on={range === k} label={k === "since-consult" ? "Since last visit" : makeRange(k, now, null).label} onPress={() => setRange(k)} />
        ))}
      </Row>
      <Button label={busy ? "Preparing…" : `Prepare my appointment · ${inRange} log${inRange === 1 ? "" : "s"}`} disabled={busy || !inRange} onPress={() => void prepare()} />
      {busy && <ActivityIndicator color={c.primary} />}

      {report && !busy && (
        <>
          <View style={[styles.seg, { backgroundColor: c.surface2 }]}>
            {(
              [
                ["script", "🗣 My script"],
                ["doctor", "🩺 For the doctor"],
              ] as const
            ).map(([k, label]) => (
              <Pressable key={k} onPress={() => setView(k)} style={[styles.segBtn, view === k && { backgroundColor: c.surface }]} accessibilityRole="tab" accessibilityState={{ selected: view === k }}>
                <Text style={{ fontWeight: "600", color: view === k ? c.ink : c.ink2 }}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {view === "script" ? (
            <View style={{ gap: space.md }}>
              <T kind="eyebrow">Read this before the questions start</T>
              {report.soapbox.map((line, i) => (
                <View key={line} style={{ flexDirection: "row", gap: space.sm }}>
                  <View style={[styles.num, { backgroundColor: c.primarySoft }]}>
                    <Text style={{ color: c.primary, fontWeight: "700", fontSize: 13 }}>{i + 1}</Text>
                  </View>
                  <T style={{ flex: 1, fontSize: 19, lineHeight: 27, fontWeight: "500" }}>{line}</T>
                </View>
              ))}
              <Button kind="ghost" label={speaking ? "■ Stop" : "▶ Practise: read it aloud to me"} onPress={speak} />
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              <Card style={{ gap: space.md }}>
                <View style={{ borderBottomWidth: 2, borderBottomColor: c.ink, paddingBottom: space.sm, gap: 2 }}>
                  <T kind="eyebrow">Patient-prepared history</T>
                  <T style={{ fontWeight: "700" }}>
                    {j.profile.name || "Patient"}
                    {j.profile.dob ? ` · DOB ${j.profile.dob}` : ""}
                  </T>
                  <T kind="small" style={{ color: c.muted }}>
                    {report.data.range.label} · {fmtDate(report.data.range.start)} – {fmtDate(report.data.range.end)}
                  </T>
                </View>
                <T style={{ fontWeight: "700" }}>CC: {report.hpi.chiefComplaint}</T>
                <View style={styles.metrics}>
                  {report.hpi.metrics.map((m) => (
                    <View key={m.label} style={[styles.metric, { backgroundColor: c.surface2 }]}>
                      <T kind="eyebrow" style={{ fontSize: 10 }}>
                        {m.label}
                      </T>
                      <T style={{ fontWeight: "700", fontSize: 14 }}>{m.value}</T>
                    </View>
                  ))}
                </View>
                {report.hpi.sections.map((s) => (
                  <View key={s.title} style={{ gap: 2 }}>
                    <T kind="eyebrow" style={{ color: c.primary, fontSize: 10.5 }}>
                      {s.title}
                    </T>
                    {s.lines.map((l) => (
                      <T key={l} kind="small" style={{ color: c.ink }}>
                        • {l}
                      </T>
                    ))}
                  </View>
                ))}
                <T kind="small" style={{ color: c.muted, fontSize: 11 }}>
                  From {report.data.logs} patient-entered logs. Descriptive only: no diagnosis or treatment advice.
                </T>
                <Badge tone={report.engine === "claude" ? "ai" : "local"} label={report.engine === "claude" ? "✨ Written with Claude" : "⚙︎ Written on this phone"} />
              </Card>
              <Button label="Share as PDF (email, print, AirDrop)" onPress={() => void shareOnePagerPdf(report, j.profile)} />
              <Button kind="ghost" label="Share as text" onPress={() => void shareOnePagerText(report, j.profile)} />
            </View>
          )}
        </>
      )}

      <AfterVisit />
    </Screen>
  );
}

/** Marks the consult and asks the two pilot questions from the proposal's Phase 3 metrics. */
function AfterVisit() {
  const j = useJournal();
  const c = useColors();
  const [heard, setHeard] = useState<number | null>(null);
  const [used, setUsed] = useState<Feedback["doctorUsedSummary"] | null>(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const last = j.profile.lastConsult;

  if (sent)
    return (
      <Card>
        <T style={{ fontWeight: "700" }}>Thank you</T>
        <T kind="small">Saved on your phone. It’s included if you choose to export your data for the study team.</T>
      </Card>
    );

  return (
    <Card style={{ gap: space.md }}>
      <T style={{ fontWeight: "700" }}>Been to your appointment?</T>
      <T kind="small">
        {last ? `Last visit marked ${fmtDate(last)}. ` : ""}Marking it lets you prepare “since last visit” next time.
      </T>
      <T kind="small" style={{ fontWeight: "600" }}>
        Did you feel heard? (1 = not at all, 5 = completely)
      </T>
      <Row gap={6}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pill key={n} label={String(n)} on={heard === n} onPress={() => setHeard(n)} />
        ))}
      </Row>
      <T kind="small" style={{ fontWeight: "600" }}>
        Did your doctor use the one-page summary?
      </T>
      <Row gap={6}>
        <Pill label="Yes" on={used === "yes"} onPress={() => setUsed("yes")} />
        <Pill label="No" on={used === "no"} onPress={() => setUsed("no")} />
        <Pill label="Didn't show it" on={used === "didnt-show"} onPress={() => setUsed("didnt-show")} />
      </Row>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Anything else? (optional)"
        placeholderTextColor={c.muted}
        multiline
        style={[styles.note, { borderColor: c.line, color: c.ink, backgroundColor: c.bg }]}
      />
      <Button
        label="I saw my doctor today"
        disabled={heard === null || used === null}
        onPress={() => {
          const at = new Date().toISOString();
          void j.updateProfile({ lastConsult: at });
          void j.addFeedback({ at, feltHeard: heard!, doctorUsedSummary: used!, note: note.trim() });
          setSent(true);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: "row", borderRadius: radius.md, padding: 4, gap: 4 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9 },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 1 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metric: { width: "48.5%", borderRadius: 6, padding: 8, gap: 2 },
  note: { borderWidth: 1, borderRadius: radius.md, padding: space.md, minHeight: 60, fontSize: 15, textAlignVertical: "top" },
});
