import { useCallback, useEffect, useRef, useState } from "react";
import { Appointment } from "./components/Appointment";
import { Capture } from "./components/Capture";
import { Hood } from "./components/Hood";
import { RedFlagOverlay, SettingsSheet, TagSheet } from "./components/Sheets";
import { Timeline } from "./components/Timeline";
import { applyPatch } from "./lib/extract";
import { fetchStatus, generateReport, processLog, savedEvent, type AiStatus, type HoodEvent } from "./lib/pipeline";
import { makeRange, type RangeKey, type Report } from "./lib/report";
import { BLANK_PROFILE, buildSeedEntries, DEMO_PROFILE } from "./lib/seed";
import { loadState, saveState, type AppState, type Settings } from "./lib/store";
import type { Tag } from "./lib/tags";
import type { Entry, FollowUpOption, HpiFields, RedFlag } from "./lib/types";

type Tab = "log" | "timeline" | "appointment";

const demoState = (): AppState => ({
  profile: DEMO_PROFILE(new Date()),
  entries: buildSeedEntries(new Date()),
  settings: { engine: "auto", region: "AU" },
});

const Logo = () => (
  <svg className="brand-mark" viewBox="0 0 64 64" width="1.1em" height="1.1em" aria-hidden>
    <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="7" />
    <path d="M32 10a22 22 0 0 1 0 44z" fill="currentColor" />
  </svg>
);

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [status, setStatus] = useState<AiStatus>({ ai: false });
  const [events, setEvents] = useState<HoodEvent[]>([]);
  const [tab, setTab] = useState<Tab>("log");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<Entry | null>(null);
  const [redFlag, setRedFlag] = useState<RedFlag | null>(null);
  const [editing, setEditing] = useState<{ entryId: string; tag: Tag } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hoodOpen, setHoodOpen] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const stateRef = useRef<AppState | null>(null);
  const logging = useRef(false);
  stateRef.current = state;

  useEffect(() => {
    void fetchStatus().then(setStatus);
    void (async () => {
      const loaded = await loadState();
      const initial = loaded ?? demoState();
      setState(initial);
      if (!loaded) await saveState(initial);
    })();
  }, []);

  const pushEvent = useCallback((e: HoodEvent) => setEvents((prev) => [...prev.slice(-60), e]), []);

  const commit = useCallback(
    async (next: AppState, announce = true) => {
      setState(next);
      const info = await saveState(next);
      if (announce) pushEvent(savedEvent(info.bytes, info.encrypted));
    },
    [pushEvent],
  );

  const cloudOn = status.ai && state?.settings.engine === "auto";

  const submitLog = useCallback(
    async (text: string, source: "voice" | "text") => {
      const s = stateRef.current;
      if (!s || logging.current) return;
      logging.current = true;
      setBusy(true);
      setCurrent(null);
      const now = new Date();
      const started = performance.now();
      const out = await processLog(text, { now, entries: s.entries, profile: s.profile, useCloud: !!cloudOn, models: status.models, source }, pushEvent);
      // Let the schema animation play even when the on-device engine is instant.
      const minVisible = 1100 - (performance.now() - started);
      if (minVisible > 0) await new Promise((r) => setTimeout(r, minVisible));
      const entry: Entry = {
        id: crypto.randomUUID?.() ?? String(Date.now()),
        createdAt: now.toISOString(),
        rawText: text,
        fields: out.result.fields,
        followUp: out.redFlag ? null : out.result.followUp,
        redFlag: out.redFlag,
        source,
        engine: out.engine,
        editedTags: [],
      };
      await commit({ ...s, entries: [...s.entries, entry] });
      logging.current = false;
      setBusy(false);
      if (out.redFlag) {
        setRedFlag(out.redFlag);
        setCurrent(null);
      } else setCurrent(entry);
      setReport(null);
    },
    [cloudOn, status.models, pushEvent, commit],
  );

  const updateEntry = useCallback(
    async (id: string, update: (e: Entry) => Entry, announce = true) => {
      const s = stateRef.current;
      if (!s) return;
      const entries = s.entries.map((e) => (e.id === id ? update(e) : e));
      await commit({ ...s, entries }, announce);
      setCurrent((c) => (c?.id === id ? entries.find((e) => e.id === id) ?? null : c));
      setReport(null);
    },
    [commit],
  );

  const answer = useCallback(
    (option: FollowUpOption | null) => {
      if (!current) return;
      void updateEntry(current.id, (e) => ({
        ...e,
        fields: option ? applyPatch(e.fields, option.patch) : e.fields,
        followUp: e.followUp ? { ...e.followUp, answer: option?.label ?? "Skipped" } : null,
      }));
    },
    [current, updateEntry],
  );

  const saveTag = useCallback(
    (fields: HpiFields) => {
      if (!editing) return;
      void updateEntry(editing.entryId, (e) => ({ ...e, fields, editedTags: [...new Set([...e.editedTags, editing.tag.key])] }));
      setEditing(null);
    },
    [editing, updateEntry],
  );

  const generate = useCallback(
    async (key: RangeKey) => {
      const s = stateRef.current;
      if (!s) return;
      setReportBusy(true);
      const started = performance.now();
      const r = await generateReport(s.entries, makeRange(key, new Date(), s.profile.lastConsult), { profile: s.profile, useCloud: !!cloudOn, models: status.models }, pushEvent);
      const minVisible = 1400 - (performance.now() - started);
      if (minVisible > 0) await new Promise((res) => setTimeout(res, minVisible));
      setReport(r);
      setReportBusy(false);
    },
    [cloudOn, status.models, pushEvent],
  );

  if (!state) return <div className="boot">Unlocking your on-device vault…</div>;

  const editingEntry = editing ? state.entries.find((e) => e.id === editing.entryId) : null;
  const changeSettings = (settings: Settings) => void commit({ ...state, settings }, false);

  return (
    <div className="stage">
      <div className="stage-intro">
        <p className="brand">
          <Logo /> Medilog
        </p>
        <h1 className="tagline">Translate, don't diagnose.</h1>
        <p className="muted">
          A 15-second voice log at home becomes a structured clinical history the doctor can read in under a minute. Interactive proof of concept.
        </p>
      </div>

      <div className="phone">
        <div className="phone-bar">
          <span className="phone-brand">
            <Logo /> Medilog
          </span>
          <span className="vault" title="Your data is encrypted and stored only on this device">
            🔒 On-device
          </span>
          <button className="icon-btn hood-toggle" onClick={() => setHoodOpen(true)} aria-label="Under the hood">
            ⓘ
          </button>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            ⚙︎
          </button>
        </div>

        <main className="phone-body">
          {tab === "log" && (
            <Capture
              entry={current}
              busy={busy}
              onSubmit={submitLog}
              onAnswer={answer}
              onReset={() => setCurrent(null)}
              onOpenTimeline={() => setTab("timeline")}
              profileName={state.profile.name}
            />
          )}
          {tab === "timeline" && (
            <Timeline
              entries={state.entries}
              onEditTag={(entry, tag) => setEditing({ entryId: entry.id, tag })}
              onDelete={(id) => void commit({ ...state, entries: state.entries.filter((e) => e.id !== id) })}
            />
          )}
          {tab === "appointment" && <Appointment entries={state.entries} profile={state.profile} report={report} busy={reportBusy} onGenerate={generate} />}
        </main>

        <nav className="tabbar">
          {(
            [
              ["log", "🎙", "Log"],
              ["timeline", "🗂", "Timeline"],
              ["appointment", "🩺", "Appointment"],
            ] as const
          ).map(([k, icon, label]) => (
            <button key={k} className={tab === k ? "tab-on" : ""} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}>
              <span aria-hidden>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        {redFlag && <RedFlagOverlay flag={redFlag} region={state.settings.region} onDismiss={() => setRedFlag(null)} />}
        {editing && editingEntry && <TagSheet entry={editingEntry} tag={editing.tag} onSave={saveTag} onClose={() => setEditing(null)} />}
        {settingsOpen && (
          <SettingsSheet
            settings={state.settings}
            aiAvailable={status.ai}
            onChange={changeSettings}
            onLoadDemo={() => {
              void commit({ ...demoState(), settings: state.settings });
              setReport(null);
              setCurrent(null);
              setSettingsOpen(false);
            }}
            onClear={() => {
              void commit({ profile: BLANK_PROFILE, entries: [], settings: state.settings });
              setReport(null);
              setCurrent(null);
              setSettingsOpen(false);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>

      <div className={`hood-wrap ${hoodOpen ? "hood-open" : ""}`}>
        <Hood events={events} status={status} cloudOn={!!cloudOn} onClose={hoodOpen ? () => setHoodOpen(false) : undefined} />
      </div>
    </div>
  );
}
