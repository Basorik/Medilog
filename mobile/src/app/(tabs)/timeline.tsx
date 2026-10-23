import Ionicons from "@expo/vector-icons/Ionicons";
import { editTag, EFFICACY_LABEL, entrySummary, tagsFor, type Efficacy, type Entry, type Tag, type TagEdit } from "@medilog/engine";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useJournal } from "../../lib/journal";
import { Button, Card, Chip, Choice, confirm, Divider, Header, Screen, Section, SeverityBadge, Sheet, T } from "../../ui/components";
import { radius, space, type, useColors } from "../../ui/theme";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const dayLabel = (ts: number, today: number) =>
  ts === today ? "Today" : ts === today - DAY ? "Yesterday" : new Date(ts).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });

export default function TimelineScreen() {
  const { entries } = useJournal();
  const [openId, setOpenId] = useState<string | null>(null);
  const today = startOfDay(new Date());
  const open = entries.find((e) => e.id === openId) ?? null;

  const groups = useMemo(() => {
    const map = new Map<number, Entry[]>();
    for (const e of [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const k = startOfDay(new Date(e.createdAt));
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries]);

  return (
    <Screen>
      <Header title="Timeline" subtitle={entries.length ? `${entries.length} ${entries.length === 1 ? "note" : "notes"}` : undefined} />
      {entries.length > 0 && <SeverityChart entries={entries} />}
      {!entries.length && (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={36} color="#9A97A1" />
          <T kind="secondary" style={{ textAlign: "center" }}>
            Nothing here yet. Your notes will appear here, organised by day.
          </T>
        </View>
      )}
      {groups.map(([day, list]) => (
        <Section key={day} title={dayLabel(day, today)}>
          {list.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <Divider inset={92} />}
              <EntryRow entry={e} onPress={() => setOpenId(e.id)} />
            </View>
          ))}
        </Section>
      ))}
      {open && <EntrySheet entry={open} onClose={() => setOpenId(null)} />}
    </Screen>
  );
}

function EntryRow({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.fill }]}>
      <T kind="caption" style={styles.time} numberOfLines={1}>
        {timeOf(entry.createdAt)}
      </T>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {entry.redFlag && <Ionicons name="warning" size={15} color={c.danger} />}
          <T kind="headline" style={{ fontSize: 16 }} numberOfLines={1}>
            {entry.fields.complaint?.patient ?? "Note"}
          </T>
        </View>
        <T kind="caption" numberOfLines={2}>
          {entrySummary(entry.fields) || entry.rawText}
        </T>
      </View>
      <SeverityBadge value={entry.fields.severity} />
    </Pressable>
  );
}

function EntrySheet({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const { saveEntry, removeEntry } = useJournal();
  const c = useColors();
  const [editing, setEditing] = useState<Tag | null>(null);

  const apply = (edit: TagEdit) => {
    if (!editing) return;
    void saveEntry({ ...entry, fields: editTag(entry.fields, editing, edit), editedTags: [...new Set([...entry.editedTags, editing.key])] });
    setEditing(null);
  };

  const when = new Date(entry.createdAt).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <Sheet visible title={editing ? "Correct this detail" : (entry.fields.complaint?.patient ?? "Note")} onClose={onClose}>
      {editing ? (
        <TagEditor entry={entry} tag={editing} onSave={apply} onBack={() => setEditing(null)} />
      ) : (
        <>
          <T kind="secondary">{when}</T>
          {entry.redFlag && (
            <Card style={{ backgroundColor: c.accentSoft, flexDirection: "row", gap: space.md }}>
              <Ionicons name="warning" size={20} color={c.danger} />
              <T kind="callout" style={{ flex: 1 }}>
                Emergency advice was shown for this note.
              </T>
            </Card>
          )}
          <View style={{ gap: space.sm }}>
            <T kind="label">What was noted · tap to correct</T>
            <View style={styles.chips}>
              {tagsFor(entry.fields).map((t) => (
                <Chip key={t.key} label={t.label} edited={entry.editedTags.includes(t.key)} onPress={() => setEditing(t)} />
              ))}
            </View>
          </View>
          <View style={{ gap: space.sm }}>
            <T kind="label">Your words</T>
            <T kind="callout" style={{ fontStyle: "italic", color: c.ink2 }}>
              “{entry.rawText}”
            </T>
            {entry.followUp?.answer && entry.followUp.answer !== "Skipped" && (
              <T kind="caption">
                {entry.followUp.question.replace(/^Logged\.\s*/, "")} {entry.followUp.answer}
              </T>
            )}
          </View>
          <Button
            variant="destructive"
            icon="trash-outline"
            label="Delete note"
            onPress={() =>
              confirm("Delete this note?", "It will be removed from this phone permanently.", "Delete", () => {
                void removeEntry(entry.id);
                onClose();
              })
            }
          />
        </>
      )}
    </Sheet>
  );
}

function TagEditor({ entry, tag, onSave, onBack }: { entry: Entry; tag: Tag; onSave: (e: TagEdit) => void; onBack: () => void }) {
  const c = useColors();
  const [patient, setPatient] = useState(tag.label);
  const [clinical, setClinical] = useState(tag.clinical);
  const input = [styles.input, { backgroundColor: c.card, color: c.ink }];

  return (
    <>
      {tag.kind === "severity" ? (
        <View style={{ gap: space.md }}>
          <T kind="secondary">How bad was it at its worst?</T>
          <View style={styles.nrs}>
            {Array.from({ length: 11 }, (_, n) => {
              const on = entry.fields.severity === n;
              return (
                <Pressable key={n} accessibilityRole="button" onPress={() => onSave({ type: "severity", value: n })} style={[styles.nrsBtn, { backgroundColor: on ? c.primary : c.card }]}>
                  <Text style={[type.headline, { color: on ? c.primaryInk : c.ink }]}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : tag.kind === "treatment" ? (
        <View style={{ gap: space.sm }}>
          <T kind="secondary">How well did {entry.fields.treatments[tag.index]?.name.toLowerCase()} work this time?</T>
          {(["helped", "partial", "none", "unknown"] as Efficacy[]).map((e) => (
            <Choice key={e} label={EFFICACY_LABEL[e].charAt(0).toUpperCase() + EFFICACY_LABEL[e].slice(1)} selected={entry.fields.treatments[tag.index]?.efficacy === e} onPress={() => onSave({ type: "efficacy", value: e })} />
          ))}
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <View style={{ gap: space.xs }}>
            <T kind="label">In your words</T>
            <TextInput style={input} value={patient} onChangeText={setPatient} />
          </View>
          <View style={{ gap: space.xs }}>
            <T kind="label">What your doctor sees</T>
            <TextInput style={input} value={clinical} onChangeText={setClinical} />
          </View>
          <Button label="Save" onPress={() => onSave({ type: "rename", patient, clinical })} />
        </View>
      )}
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Button variant="plain" icon="chevron-back" label="Back" onPress={onBack} />
        <Button variant="plain" label="Remove this detail" onPress={() => onSave({ type: "remove" })} style={{ alignSelf: "auto" }} />
      </View>
    </>
  );
}

const DAYS = 30;

function SeverityChart({ entries }: { entries: Entry[] }) {
  const c = useColors();
  const [selected, setSelected] = useState<number | null>(null);
  const today = startOfDay(new Date());
  const days = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, i) => {
        const ts = today - (DAYS - 1 - i) * DAY;
        const list = entries.filter((e) => startOfDay(new Date(e.createdAt)) === ts);
        const sev = list.map((e) => e.fields.severity).filter((s): s is number => s !== null);
        return { ts, count: list.length, max: sev.length ? Math.max(...sev) : null, period: list.some((e) => e.fields.cycle?.clinical === "Menses day 1") };
      }),
    [entries, today],
  );
  const H = 72;
  const s = selected !== null ? days[selected] : null;
  const fmt = (ts: number) => new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <T kind="headline" style={{ fontSize: 16 }}>
          Worst pain each day
        </T>
        <T kind="caption">
          {s ? `${fmt(s.ts)} · ${s.max !== null ? `${s.max}/10` : s.count ? "not rated" : "no notes"}${s.period ? " · period started" : ""}` : "Last 30 days"}
        </T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: H + 14 }} accessibilityLabel="Bar chart of the worst pain each day over the last 30 days">
        {days.map((d, i) => (
          <Pressable key={d.ts} style={{ flex: 1, height: H + 14, justifyContent: "flex-end", alignItems: "center" }} onPress={() => setSelected(i === selected ? null : i)}>
            {d.max !== null ? (
              <View style={{ width: "56%", height: Math.max(4, (d.max / 10) * H), borderRadius: 3, backgroundColor: selected === i ? c.accent : c.primary, opacity: selected === null || selected === i ? 1 : 0.45 }} />
            ) : d.count ? (
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.primary }} />
            ) : null}
            <View style={{ height: 10, justifyContent: "flex-end" }}>{d.period && <View style={[styles.periodDot, { backgroundColor: c.accent }]} />}</View>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T kind="caption">{fmt(days[0].ts)}</T>
        {days.some((d) => d.period) && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={[styles.periodDot, { backgroundColor: c.accent }]} />
            <T kind="caption">Period started</T>
          </View>
        )}
        <T kind="caption">Today</T>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", gap: space.md, paddingVertical: 60, paddingHorizontal: space.xl },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 14 },
  time: { width: 64, fontVariant: ["tabular-nums"] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  input: { borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: 13, ...type.body },
  nrs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  nrsBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  periodDot: { width: 6, height: 6, borderRadius: 3 },
});
