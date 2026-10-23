import { useMemo, useState } from "react";
import { entrySummary, tagsFor, type Tag, type Entry } from "@medilog/engine";
import { EngineBadge, Icon, SeverityBadge, TagChip } from "./ui";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function dayLabel(ts: number, today: number) {
  if (ts === today) return "Today";
  if (ts === today - DAY) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

export function Timeline({ entries, onEditTag, onDelete }: { entries: Entry[]; onEditTag: (entry: Entry, tag: Tag) => void; onDelete: (id: string) => void }) {
  const today = startOfDay(new Date());
  const groups = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const map = new Map<number, Entry[]>();
    for (const e of sorted) {
      const k = startOfDay(new Date(e.createdAt));
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries]);

  return (
    <div className="screen timeline">
      <header className="screen-head">
        <h1>Timeline</h1>
        <p className="muted">
          {entries.length} {entries.length === 1 ? "note" : "notes"}
        </p>
      </header>
      <SeverityStrip entries={entries} />
      {!entries.length && <p className="empty">Nothing here yet. Your notes will appear here, organised by day.</p>}
      {groups.map(([day, list]) => (
        <section key={day} className="day">
          <h2 className="day-label">{dayLabel(day, today)}</h2>
          <div className="list">
            {list.map((e) => (
              <EntryRow key={e.id} entry={e} onEditTag={onEditTag} onDelete={onDelete} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EntryRow({ entry, onEditTag, onDelete }: { entry: Entry; onEditTag: (entry: Entry, tag: Tag) => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const time = new Date(entry.createdAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  return (
    <article className={`entry ${open ? "entry-open" : ""}`}>
      <button className="entry-row" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="entry-time">{time}</span>
        <span className="entry-main">
          <span className="entry-title">
            {entry.redFlag && (
              <span className="flag-icon" title="Emergency advice was shown">
                <Icon name="warning" size={15} />
              </span>
            )}
            {entry.fields.complaint?.patient ?? "Note"}
          </span>
          <span className="entry-summary">{entrySummary(entry.fields) || entry.rawText}</span>
        </span>
        <SeverityBadge value={entry.fields.severity} />
      </button>
      {open && (
        <div className="entry-more">
          <p className="caption">What was noted · tap to correct</p>
          <div className="tag-row">
            {tagsFor(entry.fields).map((t) => (
              <TagChip key={t.key} tag={t} edited={entry.editedTags.includes(t.key)} onClick={() => onEditTag(entry, t)} />
            ))}
          </div>
          <blockquote>“{entry.rawText}”</blockquote>
          {entry.followUp?.answer && entry.followUp.answer !== "Skipped" && (
            <p className="caption">
              {entry.followUp.question.replace(/^Logged\.\s*/, "")} <strong>{entry.followUp.answer}</strong>
            </p>
          )}
          <div className="entry-foot">
            <EngineBadge engine={entry.engine} />
            <button className="link-btn small danger" onClick={() => onDelete(entry.id)}>
              Delete note
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

const DAYS = 30;

function SeverityStrip({ entries }: { entries: Entry[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const today = startOfDay(new Date());
  const days = useMemo(() => {
    return Array.from({ length: DAYS }, (_, i) => {
      const ts = today - (DAYS - 1 - i) * DAY;
      const list = entries.filter((e) => startOfDay(new Date(e.createdAt)) === ts);
      const sev = list.map((e) => e.fields.severity).filter((s): s is number => s !== null);
      return {
        ts,
        count: list.length,
        max: sev.length ? Math.max(...sev) : null,
        period: list.some((e) => e.fields.cycle?.clinical === "Menses day 1"),
      };
    });
  }, [entries, today]);

  const W = 10;
  const H = 64;
  const y = (v: number) => H - (v / 10) * (H - 4);
  const bar = (x: number, v: number) => {
    const top = y(v);
    const r = 3;
    const w = 6;
    return `M${x} ${H} V${top + r} Q${x} ${top} ${x + r} ${top} Q${x + w} ${top} ${x + w} ${top + r} V${H} Z`;
  };
  const h = hover !== null ? days[hover] : null;

  return (
    <figure className="strip">
      <figcaption>
        <span>Worst pain each day</span>
        <span className="muted">Last 30 days</span>
      </figcaption>
      <div className="strip-plot">
        <div className="strip-axis" aria-hidden>
          <span>10</span>
          <span>5</span>
          <span>0</span>
        </div>
        <div className="strip-svg">
        <svg viewBox={`0 0 ${DAYS * W} ${H + 12}`} role="img" aria-label="Bar chart of worst daily symptom severity over the last 30 days" onMouseLeave={() => setHover(null)}>
          <line x1="0" x2={DAYS * W} y1={y(5)} y2={y(5)} className="grid" />
          <line x1="0" x2={DAYS * W} y1={y(10)} y2={y(10)} className="grid" />
          <line x1="0" x2={DAYS * W} y1={H} y2={H} className="baseline" />
          {days.map((d, i) => (
            <g key={d.ts} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={i * W} y={0} width={W} height={H + 12} fill="transparent" />
              {d.max !== null ? (
                <path d={bar(i * W + 2, Math.max(d.max, 0.6))} className={`bar ${hover === i ? "bar-hover" : ""}`} />
              ) : d.count ? (
                <circle cx={i * W + 5} cy={H - 2} r={1.6} className="bar" />
              ) : null}
              {d.period && <circle cx={i * W + 5} cy={H + 7} r={2.6} className="period-dot" />}
            </g>
          ))}
        </svg>
        {h && (
          <div className="strip-tip" style={{ left: `${((hover! + 0.5) / DAYS) * 100}%` }}>
            <strong>{new Date(h.ts).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</strong>
            <span>{h.max !== null ? `Worst ${h.max}/10` : h.count ? "Not scored" : "Nothing logged"}</span>
            {h.count > 0 && <span>{h.count} log{h.count > 1 ? "s" : ""}</span>}
            {h.period && <span>Period started</span>}
          </div>
        )}
        </div>
      </div>
      <div className="strip-foot">
        <span>{new Date(days[0].ts).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
        <span className="legend">
          <span className="period-dot-key" /> Period started
        </span>
        <span>Today</span>
      </div>
    </figure>
  );
}
