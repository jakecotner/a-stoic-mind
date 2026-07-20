import { useEffect, useMemo, useState } from "react";
import { fetchNotes, fetchToc, fetchWorks, type AuthUser } from "./api";
import type {
  Note,
  ReadingPage,
  ReadingTarget,
  TocSection,
  Work,
} from "./types";

type View = "reading" | "journal";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function TextsNav({
  readingPos,
  onNavigate,
}: {
  readingPos: ReadingPage | null;
  onNavigate: (target: ReadingTarget) => void;
}) {
  const [works, setWorks] = useState<Work[]>([]);
  const [toc, setToc] = useState<TocSection[]>([]);

  useEffect(() => {
    fetchWorks().then(setWorks).catch(() => {});
  }, []);

  const work = readingPos?.work;
  useEffect(() => {
    if (!work) {
      setToc([]);
      return;
    }
    let cancelled = false;
    fetchToc(work)
      .then((sections) => {
        if (!cancelled) setToc(sections);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [work]);

  if (!readingPos) {
    return (
      <>
        {works.map((w) => (
          <button
            key={w.work}
            className="side-item"
            onClick={() => onNavigate({ kind: "work", work: w.work })}
          >
            <span className="side-item-label">{w.work}</span>
            <span className="side-item-meta">{w.author}</span>
          </button>
        ))}
      </>
    );
  }

  const offset = readingPos.offset;
  return (
    <>
      {toc.map((s) => {
        const active = offset >= s.offset && offset < s.offset + s.count;
        return (
          <button
            key={s.label}
            className={active ? "side-item side-active" : "side-item"}
            onClick={() =>
              onNavigate({ kind: "position", work: readingPos.work, offset: s.offset })
            }
          >
            <span className="side-item-label">{s.label}</span>
            {s.count > 1 && <span className="side-item-meta">{s.count}</span>}
          </button>
        );
      })}
    </>
  );
}

function JournalNav({
  user,
  notesVersion,
}: {
  user: AuthUser | null;
  notesVersion: number;
}) {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    fetchNotes().then((ns) => {
      if (!cancelled) setNotes(ns);
    });
    return () => {
      cancelled = true;
    };
  }, [user, notesVersion]);

  // Group newest-first entries by month, preserving order.
  const groups = useMemo(() => {
    const out: { month: string; notes: Note[] }[] = [];
    for (const n of notes) {
      const month = new Date(n.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      });
      if (out.length === 0 || out[out.length - 1].month !== month) {
        out.push({ month, notes: [] });
      }
      out[out.length - 1].notes.push(n);
    }
    return out;
  }, [notes]);

  const scrollTo = (id: string) => {
    document
      .getElementById(`note-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {!user ? (
        <p className="side-hint">Sign in to keep a journal.</p>
      ) : groups.length === 0 ? (
        <p className="side-hint">No entries yet.</p>
      ) : (
        groups.map((g) => (
          <div key={g.month} className="side-group">
            <div className="side-group-label">{g.month}</div>
            {g.notes.map((n) => (
              <button
                key={n.id}
                className="side-item"
                onClick={() => scrollTo(n.id)}
              >
                <span className="side-item-label">
                  {n.passage
                    ? `on ${n.passage.reference}`
                    : n.content.length > 40
                      ? n.content.slice(0, 40) + "…"
                      : n.content}
                </span>
                <span className="side-item-meta">{shortDate(n.created_at)}</span>
              </button>
            ))}
          </div>
        ))
      )}
    </>
  );
}

function ToggleButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <button
      className="side-toggle"
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      onClick={onToggle}
    >
      <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">
        <rect
          x="0.5"
          y="0.5"
          width="17"
          height="15"
          rx="2.5"
          fill="none"
          stroke="currentColor"
        />
        <line x1="6" y1="0.5" x2="6" y2="15.5" stroke="currentColor" />
      </svg>
    </button>
  );
}

/** Shared left sidebar; its contents follow the active view. */
export default function Sidebar({
  view,
  user,
  collapsed,
  onToggle,
  readingPos,
  onNavigateReading,
  notesVersion,
}: {
  view: View;
  user: AuthUser | null;
  collapsed: boolean;
  onToggle: () => void;
  readingPos: ReadingPage | null;
  onNavigateReading: (target: ReadingTarget) => void;
  notesVersion: number;
}) {
  if (collapsed) {
    // Slim rail: just the expand affordance.
    return (
      <aside className="sidebar sidebar-collapsed">
        <div className="sidebar-rail">
          <ToggleButton collapsed onToggle={onToggle} />
        </div>
      </aside>
    );
  }

  const title =
    view === "reading" ? readingPos?.work ?? "Texts" : "Entries";

  return (
    <aside className="sidebar">
      {/* Fixed-width inner wrapper so content doesn't reflow mid-animation. */}
      <div className="sidebar-inner">
        <div className="side-head">
          <h3 className="side-title">{title}</h3>
          <div className="side-head-actions">
            {view === "reading" && readingPos && (
              <button
                className="side-action"
                onClick={() => onNavigateReading({ kind: "picker" })}
              >
                All texts
              </button>
            )}
            <ToggleButton collapsed={false} onToggle={onToggle} />
          </div>
        </div>
        {view === "reading" && (
          <TextsNav readingPos={readingPos} onNavigate={onNavigateReading} />
        )}
        {view === "journal" && <JournalNav user={user} notesVersion={notesVersion} />}
      </div>
    </aside>
  );
}
