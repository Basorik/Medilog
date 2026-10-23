import { fmtDate, generateReport, makeRange, type RangeKey, type Report } from "@medilog/engine";
import * as Speech from "expo-speech";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { useJournal, type Feedback } from "../../lib/journal";
import { atLeast } from "../../lib/timing";
import { shareOnePagerPdf, shareOnePagerText } from "../../lib/share";
import { Button, Card, Choice, Header, Icon, Row, Screen, Section, Segmented, Sheet, T } from "../../ui/components";
import { radius, space, type, useColors } from "../../ui/theme";

const RANGE_LABEL: Record<RangeKey, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days", "since-consult": "Since visit" };

export default function AppointmentScreen() {
  const j = useJournal();
  const c = useColors();
  const [range, setRange] = useState<RangeKey>("30d");
  // A report is only shown for the notes and timeframe it was made from.
  const [made, setReport] = useState<{ report: Report; entries: unknown; range: RangeKey } | null>(null);
  const report = made && made.entries === j.entries && made.range === range ? made.report : null;
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"script" | "doctor">("script");
  const [speaking, setSpeaking] = useState(false);
  const [afterVisit, setAfterVisit] = useState(false);
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
      <Header title="Appointment" subtitle="What to say, and what to show your doctor" />

      <View style={{ gap: space.md }}>
        <Segmented options={keys.map((k) => ({ value: k, label: RANGE_LABEL[k] }))} value={range} onChange={setRange} />
        <T kind="caption" style={{ textAlign: "center" }}>
          {inRange ? `${inRange} ${inRange === 1 ? "note" : "notes"} in this period` : "No notes in this period yet"}
        </T>
        {!report && <Button label={busy ? "Preparing…" : "Prepare my appointment"} icon={busy ? undefined : "sparkles-outline"} disabled={busy || !inRange} onPress={() => void prepare()} />}
        {busy && <ActivityIndicator color={c.primary} />}
      </View>

      {report && !busy && (
        <View style={{ gap: space.lg }}>
          <Segmented
            options={[
              { value: "script", label: "Your script" },
              { value: "doctor", label: "For your doctor" },
            ]}
            value={view}
            onChange={setView}
          />
          {view === "script" ? (
            <>
              <Card style={{ gap: space.lg }}>
                <T kind="label">Read this before the questions start</T>
                {report.soapbox.map((line, i) => (
                  <View key={line} style={{ flexDirection: "row", gap: space.md }}>
                    <Text style={[type.label, styles.num, { color: c.primary }]}>{i + 1}</Text>
                    <T style={{ flex: 1, fontSize: 19, lineHeight: 28, fontWeight: "500" }}>{line}</T>
                  </View>
                ))}
              </Card>
              <Button variant="secondary" icon={speaking ? "stop" : "volume-high-outline"} label={speaking ? "Stop" : "Read it to me"} onPress={speak} />
            </>
          ) : (
            <>
              <OnePager report={report} />
              <View style={{ gap: space.sm }}>
                <Button icon="share-outline" label="Share as PDF" onPress={() => void shareOnePagerPdf(report, j.profile)} />
                <Button variant="plain" label="Share as text" onPress={() => void shareOnePagerText(report, j.profile)} />
              </View>
            </>
          )}
        </View>
      )}

      <Section footer="Marking your visit lets you prepare “since visit” next time.">
        <Row
          icon="calendar-outline"
          title="Been to your appointment?"
          detail={j.profile.lastConsult ? `Last visit marked ${fmtDate(j.profile.lastConsult)}` : undefined}
          onPress={() => setAfterVisit(true)}
        />
      </Section>

      <AfterVisit visible={afterVisit} onClose={() => setAfterVisit(false)} />
    </Screen>
  );
}

function OnePager({ report }: { report: Report }) {
  const { profile } = useJournal();
  const c = useColors();
  return (
    <Card style={{ gap: space.lg }}>
      <View style={{ gap: 2 }}>
        <T kind="label">Patient-prepared history</T>
        <T kind="headline">
          {profile.name || "Patient"}
          {profile.dob ? ` · DOB ${profile.dob}` : ""}
        </T>
        <T kind="caption">
          {fmtDate(report.data.range.start)} – {fmtDate(report.data.range.end)}
        </T>
      </View>
      <T kind="headline" style={{ fontSize: 16 }}>
        {report.hpi.chiefComplaint}
      </T>
      <View style={styles.metrics}>
        {report.hpi.metrics.map((m) => (
          <View key={m.label} style={[styles.metric, { backgroundColor: c.fill }]}>
            <T kind="caption">{m.label}</T>
            <T kind="headline" style={{ fontSize: 15 }}>
              {m.value}
            </T>
          </View>
        ))}
      </View>
      {report.hpi.sections.map((s) => (
        <View key={s.title} style={{ gap: space.xs }}>
          <T kind="label" style={{ color: c.primary }}>
            {s.title}
          </T>
          {s.lines.map((l) => (
            <T key={l} kind="callout" style={{ color: c.ink2 }}>
              {l}
            </T>
          ))}
        </View>
      ))}
      <T kind="caption">
        From {report.data.logs} patient-entered notes. Descriptive only, with no diagnosis or treatment advice. {report.engine === "claude" ? "Written with Claude." : "Written on this phone."}
      </T>
    </Card>
  );
}

const HEARD = ["Not at all", "A little", "Somewhat", "Mostly", "Completely"];
const USED: { value: Feedback["doctorUsedSummary"]; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "didnt-show", label: "Didn’t show it" },
];

/** Marks the consult and asks the two pilot questions from the proposal's Phase 3 metrics. */
function AfterVisit({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const j = useJournal();
  const c = useColors();
  const [heard, setHeard] = useState<number | null>(null);
  const [used, setUsed] = useState<Feedback["doctorUsedSummary"] | null>(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const close = () => {
    onClose();
    if (sent) {
      setHeard(null);
      setUsed(null);
      setNote("");
      setSent(false);
    }
  };

  return (
    <Sheet visible={visible} title={sent ? "Thank you" : "After your visit"} onClose={close}>
      {sent ? (
        <>
          <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
            <Icon name="checkmark-circle" size={24} color={c.ok} />
            <T kind="callout" style={{ flex: 1 }}>
              Saved on your phone. It’s included if you choose to export your data for the study team.
            </T>
          </View>
          <Button label="Done" onPress={close} />
        </>
      ) : (
        <>
          <View style={{ gap: space.sm }}>
            <T kind="headline">Did you feel heard?</T>
            {HEARD.map((label, i) => (
              <Choice key={label} label={label} selected={heard === i + 1} onPress={() => setHeard(i + 1)} />
            ))}
          </View>
          <View style={{ gap: space.sm }}>
            <T kind="headline">Did your doctor use the one-page summary?</T>
            <Segmented options={USED} value={used ?? ("" as Feedback["doctorUsedSummary"])} onChange={setUsed} />
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Anything else? (optional)"
            placeholderTextColor={c.muted}
            multiline
            style={[styles.note, { color: c.ink, backgroundColor: c.card }]}
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
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  num: { width: 18, marginTop: 5, fontSize: 15 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  metric: { flexGrow: 1, flexBasis: "45%", borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: space.md, gap: 2 },
  note: { borderRadius: radius.md, padding: space.lg, minHeight: 80, ...type.body, textAlignVertical: "top" },
});
