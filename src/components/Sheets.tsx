import { useState } from "react";
import { EMERGENCY, editTag, EFFICACY_LABEL, type Tag, type TagEdit, type Efficacy, type Entry, type HpiFields, type RedFlag } from "@medilog/engine";
import type { Settings } from "../lib/store";
import { Icon, Sheet } from "./ui";

export function TagSheet({ entry, tag, onSave, onClose }: { entry: Entry; tag: Tag; onSave: (fields: HpiFields) => void; onClose: () => void }) {
  const [patient, setPatient] = useState(tag.label);
  const [clinical, setClinical] = useState(tag.clinical);
  const apply = (edit: TagEdit) => onSave(editTag(entry.fields, tag, edit));

  return (
    <Sheet title="Correct this detail" onClose={onClose}>
      {tag.kind === "severity" ? (
        <>
          <p className="muted small">How bad was it at its worst?</p>
          <div className="nrs">
            {Array.from({ length: 11 }, (_, n) => (
              <button key={n} className={`nrs-btn ${entry.fields.severity === n ? "on" : ""}`} onClick={() => apply({ type: "severity", value: n })}>
                {n}
              </button>
            ))}
          </div>
        </>
      ) : tag.kind === "treatment" ? (
        <>
          <p className="muted small">How well did {entry.fields.treatments[tag.index]?.name.toLowerCase()} work this time?</p>
          <div className="choices">
            {(["helped", "partial", "none", "unknown"] as Efficacy[]).map((e) => (
              <button key={e} className={`choice ${entry.fields.treatments[tag.index]?.efficacy === e ? "choice-on" : ""}`} onClick={() => apply({ type: "efficacy", value: e })}>
                {EFFICACY_LABEL[e].charAt(0).toUpperCase() + EFFICACY_LABEL[e].slice(1)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <form
          className="tag-form"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ type: "rename", patient, clinical });
          }}
        >
          <label>
            In your words
            <input value={patient} onChange={(e) => setPatient(e.target.value)} />
          </label>
          <label>
            What your doctor sees
            <input value={clinical} onChange={(e) => setClinical(e.target.value)} />
          </label>
          <button className="btn primary block" type="submit">
            Save
          </button>
        </form>
      )}
      <button className="link-btn danger" onClick={() => apply({ type: "remove" })}>
        Remove this detail
      </button>
    </Sheet>
  );
}

export function SettingsSheet({
  settings,
  aiAvailable,
  onChange,
  onLoadDemo,
  onClear,
  onClose,
}: {
  settings: Settings;
  aiAvailable: boolean;
  onChange: (s: Settings) => void;
  onLoadDemo: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="setting">
        <p className="setting-l">AI engine</p>
        <div className="seg small">
          <button className={settings.engine === "auto" ? "seg-on" : ""} disabled={!aiAvailable} onClick={() => onChange({ ...settings, engine: "auto" })}>
            Claude {aiAvailable ? "" : "(no key)"}
          </button>
          <button className={settings.engine === "local" || !aiAvailable ? "seg-on" : ""} onClick={() => onChange({ ...settings, engine: "local" })}>
            On-device only
          </button>
        </div>
        <p className="muted small">On-device mode is offline, instant and free: a safe fallback if the venue wifi drops mid-pitch.</p>
      </div>
      <div className="setting">
        <p className="setting-l">Emergency number</p>
        <div className="seg small">
          <button className={settings.region === "AU" ? "seg-on" : ""} onClick={() => onChange({ ...settings, region: "AU" })}>
            Australia · 000
          </button>
          <button className={settings.region === "US" ? "seg-on" : ""} onClick={() => onChange({ ...settings, region: "US" })}>
            US · 911
          </button>
        </div>
      </div>
      <div className="setting">
        <p className="setting-l">Demo data</p>
        <div className="row">
          <button className="btn ghost" onClick={onLoadDemo}>
            Load sample patient
          </button>
          <button className="btn ghost danger" onClick={onClear}>
            Start empty
          </button>
        </div>
        <p className="muted small">The sample patient is fictional: 17 logs over 10 weeks of recurrent right-sided pelvic pain.</p>
      </div>
    </Sheet>
  );
}

export function RedFlagOverlay({ flag, region, onDismiss }: { flag: RedFlag; region: Settings["region"]; onDismiss: () => void }) {
  const em = EMERGENCY[region];
  return (
    <div className="redflag" role="alertdialog" aria-modal="true" aria-labelledby="rf-title">
      <div className="redflag-icon">
        <Icon name="warning" size={34} />
      </div>
      <h2 id="rf-title">{flag.title}</h2>
      {flag.crisis ? (
        <p>
          What you're describing matters, and you don't have to handle it alone. Please talk to someone now: call <strong>{em.crisisLine}</strong>, or{" "}
          <strong>{em.number}</strong> if you are in immediate danger.
        </p>
      ) : (
        <p>
          What you've described can be a medical emergency. <strong>Call {em.number} now.</strong> Don't drive yourself, and don't wait to see if it
          passes.
        </p>
      )}
      <a className="btn call" href={`tel:${flag.crisis ? em.crisisTel : em.number}`}>
        <Icon name="phone" size={20} /> Call {flag.crisis ? em.crisisLine : em.number}
      </a>
      {flag.crisis && (
        <a className="btn call outline" href={`tel:${em.number}`}>
          Call {em.number}
        </a>
      )}
      <p className="redflag-note">This is a fixed safety rule, not an AI judgement. Your note was saved and marked so your doctor can see it.</p>
      <button className="link-btn light" onClick={onDismiss}>
        I'm safe: return to the app
      </button>
    </div>
  );
}
