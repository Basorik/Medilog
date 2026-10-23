import type { ReactNode } from "react";
import type { Tag } from "@medilog/engine";

// A small line-icon set, drawn inline so the demo needs no icon font or network.
const ICONS = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  doc: <path d="M7 3.5h6.5l4.5 4.5v12.5H7zM13.5 3.5V8H18M10 13h5M10 16.5h5" />,
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.4" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="10" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  speaker: <path d="M4.5 9.5v5h3.5l4.5 4v-13l-4.5 4zM16 9a4.2 4.2 0 0 1 0 6" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  print: (
    <>
      <path d="M7.5 9V3.5h9V9" />
      <rect x="3.5" y="9" width="17" height="8" rx="2" />
      <path d="M7.5 14h9v6.5h-9z" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h3.5" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  warning: <path d="M12 4l9 16H3zM12 10v4.5M12 17.2v.3" />,
  phone: <path d="M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" />,
  pencil: <path d="M4.5 19.5h4l10-10-4-4-10 10zM13 7l4 4" />,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export function TagChip({ tag, edited, onClick }: { tag: Tag; edited?: boolean; onClick?: () => void }) {
  const cls = `tag tag-${tag.kind}${edited ? " tag-edited" : ""}`;
  const body = (
    <>
      <span>{tag.label}</span>
      {edited && (
        <span className="tag-edit-mark" title="Edited by you">
          <Icon name="pencil" size={12} />
        </span>
      )}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} title={`Doctor sees: ${tag.clinical}`}>
      {body}
    </button>
  ) : (
    <span className={cls} title={`Doctor sees: ${tag.clinical}`}>
      {body}
    </span>
  );
}

export function SeverityBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const tone = value >= 7 ? "high" : value >= 4 ? "mid" : "low";
  return (
    <span className={`sev sev-${tone}`} aria-label={`Severity ${value} out of 10`}>
      {value}
    </span>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn round" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EngineBadge({ engine }: { engine: "claude" | "local" }) {
  return engine === "claude" ? (
    <span className="badge badge-ai" title="Structured by Claude via the stateless relay">
      Claude
    </span>
  ) : (
    <span className="badge badge-local" title="Structured by the on-device engine">
      On-device
    </span>
  );
}
