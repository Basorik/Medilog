import { editTag, EFFICACY_LABEL, tagsFor, type Efficacy, type Entry, type Tag, type TagEdit } from "@medilog/engine";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useJournal } from "../../lib/journal";
import { Badge, Button, Card, confirm, Pill, Row, Screen, Sheet, T, TagChip } from "../../ui/components";
import { radius, space, useColors } from "../../ui/theme";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const dayLabel = (ts: number, today: number) =>
  ts === today ? "Today" : ts === today - DAY ? "Yesterday" : new Date(ts).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

export default function TimelineScreen() {
  const { entries, saveEntry, removeEntry } = useJournal();
  const [editing, setEditing] = useState<{ entry: Entry; tag: Tag } | null>(null);
  const today = startOfDay(new Date());

  const groups = useMemo(() => {
    const map = new Map<number, Entry[]>();
    for (const e of [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const k = startOfDay(new Date(e.createdAt));
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries]);

  const save = (edit: TagEdit) => {
    if (!editing) return;
    const { entry, tag } = editing;
    void saveEntry({ ...entry, fields: editTag(entry.fields, tag, edit), editedTags: [...new Set([...entry.editedTags, tag.key])] });
    setEditing(null);
  };

  return (
    <Screen>
      <T kind="muted">
        {entries.length} {entries.length === 1 ? "entry" : "entries"}, organised automatically. Tap a tag to correct it.
      </T>
      <SeverityStrip entries={entries} />
      {!entries.length && <T kind="muted" style={{ textAlign: "center", paddingVertical: space.xl }}>Nothing logged yet. Your first note will appear here.</T>}
      {groups.map(([day, list]) => (
        <View key={day} style={{ gap: space.sm }}>
          <T kind="eyebrow">{dayLabel(day, today)}</T>
          {list.map((e) => (
            <EntryCard key={e.id} entry={e} onEditTag={(tag) => setEditing({ entry: e, tag })} onDelete={() => void removeEntry(e.id)} />
          ))}
        </View>
      ))}
      {editing && <TagSheet entry={editing.entry} tag={editing.tag} onSave={save} onClose={() => setEditing(null)} />}
    </Screen>
  );
}

function EntryCard({ entry, onEditTag, onDelete }: { entry: Entry; onEditTag: (t: Tag) => void; onDelete: () => void }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const time = new Date(entry.createdAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  const confirmDelete = () => confirm("Delete this entry?", "It will be removed from this phone permanently.", "Delete", onDelete);
  return (
    <Card style={entry.redFlag ? { borderColor: c.danger } : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
        <T kind="small" style={{ color: c.muted }}>
          {time}
        </T>
        <T style={{ fontWeight: "700", flex: 1 }}>{entry.fields.complaint?.patient ?? "Note"}</T>
        {entry.redFlag && <Badge tone="danger" label="⚠ Emergency advice shown" />}
      </View>
      <Row gap={6}>
        {tagsFor(entry.fields).map((t) => (
          <TagChip key={t.key} tag={t} edited={entry.editedTags.includes(t.key)} onPress={() => onEditTag(t)} />
        ))}
      </Row>
      <Pressable onPress={() => setOpen(!open)} hitSlop={8}>
        <Text style={{ color: c.primary, fontWeight: "600", fontSize: 13 }}>{open ? "Hide original note" : "Show original note"}</Text>
      </Pressable>
      {open && (
        <View style={{ gap: space.xs }}>
          <T kind="small" style={{ fontStyle: "italic", borderLeftWidth: 3, borderLeftColor: c.line, paddingLeft: space.sm }}>
            “{entry.rawText}”
          </T>
          {entry.followUp && (
            <T kind="small" style={{ color: c.muted }}>
              Asked: {entry.followUp.question} → {entry.followUp.answer ?? "not answered"}
            </T>
          )}
          <Pressable onPress={confirmDelete} hitSlop={8}>
            <Text style={{ color: c.danger, fontWeight: "600", fontSize: 13 }}>Delete entry</Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

function TagSheet({ entry, tag, onSave, onClose }: { entry: Entry; tag: Tag; onSave: (e: TagEdit) => void; onClose: () => void }) {
  const c = useColors();
  const [patient, setPatient] = useState(tag.label);
  const [clinical, setClinical] = useState(tag.clinical);
  const input = [styles.input, { borderColor: c.line, backgroundColor: c.surface, color: c.ink }];
  return (
    <Sheet visible title="Adjust this tag" onClose={onClose}>
      {tag.kind === "severity" ? (
        <>
          <T kind="small">How bad was it at its worst?</T>
          <View style={styles.nrs}>
            {Array.from({ length: 11 }, (_, n) => (
              <Pressable
                key={n}
                onPress={() => onSave({ type: "severity", value: n })}
                style={[styles.nrsBtn, { borderColor: c.line, backgroundColor: entry.fields.severity === n ? c.accent : c.surface }]}
              >
                <Text style={{ fontWeight: "700", color: entry.fields.severity === n ? "#fff" : c.ink }}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : tag.kind === "treatment" ? (
        <>
          <T kind="small">How well did {entry.fields.treatments[tag.index]?.name.toLowerCase()} work this time?</T>
          <Row>
            {(["helped", "partial", "none", "unknown"] as Efficacy[]).map((e) => (
              <Pill key={e} label={EFFICACY_LABEL[e]} on={entry.fields.treatments[tag.index]?.efficacy === e} onPress={() => onSave({ type: "efficacy", value: e })} />
            ))}
          </Row>
        </>
      ) : (
        <>
          <T kind="eyebrow">In your words</T>
          <TextInput style={input} value={patient} onChangeText={setPatient} />
          <T kind="eyebrow">What your doctor sees</T>
          <TextInput style={input} value={clinical} onChangeText={setClinical} />
          <Button label="Save" onPress={() => onSave({ type: "rename", patient, clinical })} />
        </>
      )}
      <Button kind="link" label="Remove this tag" onPress={() => onSave({ type: "remove" })} style={{ alignSelf: "flex-start" }} />
    </Sheet>
  );
}

const DAYS = 30;

function SeverityStrip({ entries }: { entries: Entry[] }) {
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
  const H = 64;
  const s = selected !== null ? days[selected] : null;
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <T kind="small" style={{ fontWeight: "700" }}>
          Worst severity per day
        </T>
        <T kind="small" style={{ color: c.muted }}>
          {s
            ? `${new Date(s.ts).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} · ${s.max !== null ? `${s.max}/10` : s.count ? "not scored" : "nothing logged"}${s.period ? " · period started" : ""}`
            : "last 30 days · tap a day"}
        </T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: H + 12 }} accessibilityLabel="Bar chart of worst daily symptom severity over the last 30 days">
        {days.map((d, i) => (
          <Pressable key={d.ts} style={{ flex: 1, height: H + 12, justifyContent: "flex-end", alignItems: "center" }} onPress={() => setSelected(i === selected ? null : i)}>
            {d.max !== null ? (
              <View style={{ width: "60%", height: Math.max(3, (d.max / 10) * H), borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: selected === i ? c.accent : c.primary }} />
            ) : d.count ? (
              <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: c.primary }} />
            ) : null}
            <View style={{ height: 1, alignSelf: "stretch", backgroundColor: c.muted, opacity: 0.6 }} />
            <View style={{ height: 10, justifyContent: "center" }}>{d.period && <View style={[styles.periodDot, { borderColor: c.danger }]} />}</View>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T kind="small" style={{ color: c.muted, fontSize: 11 }}>
          {new Date(days[0].ts).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
        </T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={[styles.periodDot, { borderColor: c.danger }]} />
          <T kind="small" style={{ color: c.muted, fontSize: 11 }}>
            Period started
          </T>
        </View>
        <T kind="small" style={{ color: c.muted, fontSize: 11 }}>
          Today
        </T>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 11, fontSize: 16 },
  nrs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  nrsBtn: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  periodDot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.4 },
});
