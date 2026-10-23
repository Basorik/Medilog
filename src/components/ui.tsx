import type { ReactNode } from "react";
import type { Tag } from "@medilog/engine";

export function TagChip({ tag, edited, onClick, size = "md" }: { tag: Tag; edited?: boolean; onClick?: () => void; size?: "sm" | "md" }) {
  const cls = `tag tag-${tag.kind} tag-${size}${edited ? " tag-edited" : ""}`;
  const body = (
    <>
      <span className="tag-emoji" aria-hidden>
        {tag.emoji}
      </span>
      <span>{tag.label}</span>
      {edited && (
        <span className="tag-edit-mark" title="Edited by you">
          ✎
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

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
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
      ✨ Claude
    </span>
  ) : (
    <span className="badge badge-local" title="Structured by the on-device engine">
      ⚙︎ On-device
    </span>
  );
}
