import {
  BLANK_PROFILE,
  buildSeedEntries,
  DEMO_PROFILE,
  fetchStatus,
  type AiStatus,
  type Entry,
  type Profile,
} from "@medilog/engine";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RELAY_URL } from "./config";
import { scheduleReminder } from "./reminders";
import * as vault from "./vault";

export interface Settings {
  onboarded: boolean;
  consentAt: string | null;
  region: "AU" | "US";
  reminder: { enabled: boolean; hour: number };
  /** Never send voice audio off the phone; fall back to typing if on-device speech is missing. */
  requireOnDeviceSpeech: boolean;
  /** Send de-identified text to the relay for AI structuring. Off unless the user opts in. */
  cloudAi: boolean;
}

/** Pilot metrics, answered by the patient after a real appointment. Stays on the phone unless exported. */
export interface Feedback {
  at: string;
  feltHeard: number; // 1–5
  doctorUsedSummary: "yes" | "no" | "didnt-show";
  note: string;
}

const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  consentAt: null,
  region: "AU",
  reminder: { enabled: false, hour: 20 },
  requireOnDeviceSpeech: false,
  cloudAi: false,
};

interface Journal {
  ready: boolean;
  vaultReset: boolean;
  encrypted: boolean;
  profile: Profile;
  entries: Entry[];
  settings: Settings;
  feedback: Feedback[];
  ai: AiStatus;
  useCloud: boolean;
  finishOnboarding(p: { name: string; dob: string; sample: boolean }): Promise<void>;
  saveEntry(e: Entry): Promise<void>;
  removeEntry(id: string): Promise<void>;
  updateProfile(p: Partial<Profile>): Promise<void>;
  updateSettings(s: Partial<Settings>): Promise<void>;
  addFeedback(f: Feedback): Promise<void>;
  loadSample(): Promise<void>;
  wipeEverything(): Promise<void>;
  exportJson(): string;
}

const Ctx = createContext<Journal | null>(null);

export function JournalProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<vault.VaultInfo>({ encrypted: false, reset: false });
  const [profile, setProfile] = useState<Profile>(BLANK_PROFILE);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [ai, setAi] = useState<AiStatus>({ ai: false });
  // Latest settings for callbacks; written only where settings change.
  const settingsRef = useRef(settings);

  useEffect(() => {
    void (async () => {
      const opened = await vault.openVault();
      const [p, s, f, list] = await Promise.all([
        vault.getValue<Profile>("profile"),
        vault.getValue<Settings>("settings"),
        vault.getValue<Feedback[]>("feedback"),
        vault.loadEntries(),
      ]);
      setInfo(opened);
      if (p) setProfile(p);
      if (s) {
        settingsRef.current = { ...DEFAULT_SETTINGS, ...s };
        setSettings(settingsRef.current);
      }
      if (f) setFeedback(f);
      setEntries(list);
      setReady(true);
    })();
    if (RELAY_URL) void fetchStatus().then(setAi);
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await vault.setValue("settings", next);
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      const next = { ...profile, ...patch };
      setProfile(next);
      await vault.setValue("profile", next);
    },
    [profile],
  );

  const saveEntry = useCallback(async (e: Entry) => {
    setEntries((prev) => [...prev.filter((x) => x.id !== e.id), e].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    await vault.putEntry(e);
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    setEntries((prev) => prev.filter((x) => x.id !== id));
    await vault.deleteEntry(id);
  }, []);

  const loadSample = useCallback(async () => {
    const now = new Date();
    const sample = buildSeedEntries(now);
    const p = { ...DEMO_PROFILE(now), region: settingsRef.current.region };
    setEntries(sample);
    setProfile(p);
    await vault.replaceAllEntries(sample);
    await vault.setValue("profile", p);
  }, []);

  const finishOnboarding = useCallback(
    async ({ name, dob, sample }: { name: string; dob: string; sample: boolean }) => {
      if (sample) await loadSample();
      else {
        const p = { ...BLANK_PROFILE, name: name.trim(), dob: dob.trim(), region: settingsRef.current.region };
        setProfile(p);
        await vault.setValue("profile", p);
      }
      await updateSettings({ onboarded: true, consentAt: new Date().toISOString() });
    },
    [loadSample, updateSettings],
  );

  const addFeedback = useCallback(
    async (f: Feedback) => {
      const next = [...feedback, f];
      setFeedback(next);
      await vault.setValue("feedback", next);
    },
    [feedback],
  );

  const wipeEverything = useCallback(async () => {
    await scheduleReminder({ enabled: false, hour: 20 });
    await vault.wipeVault();
    await vault.openVault();
    setEntries([]);
    setProfile(BLANK_PROFILE);
    setFeedback([]);
    settingsRef.current = DEFAULT_SETTINGS;
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const exportJson = useCallback(
    () => JSON.stringify({ exportedAt: new Date().toISOString(), app: "Medilog beta", profile, settings, feedback, entries }, null, 2),
    [profile, settings, feedback, entries],
  );

  const value = useMemo<Journal>(
    () => ({
      ready,
      vaultReset: info.reset,
      encrypted: info.encrypted,
      profile,
      entries,
      settings,
      feedback,
      ai,
      useCloud: ai.ai && settings.cloudAi,
      finishOnboarding,
      saveEntry,
      removeEntry,
      updateProfile,
      updateSettings,
      addFeedback,
      loadSample,
      wipeEverything,
      exportJson,
    }),
    [ready, info, profile, entries, settings, feedback, ai, finishOnboarding, saveEntry, removeEntry, updateProfile, updateSettings, addFeedback, loadSample, wipeEverything, exportJson],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJournal(): Journal {
  const j = useContext(Ctx);
  if (!j) throw new Error("useJournal outside JournalProvider");
  return j;
}
