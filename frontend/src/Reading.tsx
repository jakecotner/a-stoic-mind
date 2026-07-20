import { useCallback, useEffect, useState } from "react";
import Markdown from "react-markdown";
import {
  createNote,
  fetchNotes,
  fetchReadingPage,
  fetchWorks,
  streamReflection,
  type AuthUser,
} from "./api";
import type { Note, ReadingPage, ReadingTarget, Work } from "./types";
import { PlayButton } from "./audio";
import { MicButton, useDictation } from "./dictation";

const LAST_WORK_KEY = "stoa:reading:last-work";
const posKey = (work: string) => `stoa:reading:pos:${work}`;

/** On-demand LLM breakdown of the visible passage (cached server-side).
    Mounted with key={passageId} so state resets on page turn. */
function PassageBreakdown({ passageId }: { passageId: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [started, setStarted] = useState(false);

  const toggle = () => {
    if (!started) {
      setStarted(true);
      setStreaming(true);
      streamReflection(passageId, {
        onMeta: () => {},
        onDelta: (d) => setText((t) => t + d),
        onError: () => setStreaming(false),
        onDone: () => setStreaming(false),
      });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button className="auth-link" onClick={toggle}>
        {open ? "Hide breakdown" : "Breakdown from the Stoa"}
      </button>
      {open && (
        <div className="daily-breakdown passage-breakdown">
          {text ? (
            <Markdown>{text}</Markdown>
          ) : streaming ? (
            <div className="thinking">Reading the passage&hellip;</div>
          ) : (
            <p className="side-hint">Could not load the breakdown.</p>
          )}
        </div>
      )}
    </>
  );
}

function PassageNotes({ passageId, user }: { passageId: number; user: AuthUser | null }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const dictation = useDictation((t) =>
    setDraft((d) => (d ? d.trimEnd() + " " + t : t)),
  );
  const stopDictation = dictation.stop;

  useEffect(() => {
    setComposing(false);
    setDraft("");
    stopDictation();
    if (!user) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    fetchNotes(passageId).then((ns) => {
      if (!cancelled) setNotes(ns);
    });
    return () => {
      cancelled = true;
    };
  }, [passageId, user, stopDictation]);

  async function save() {
    const content = draft.trim();
    if (!content || busy) return;
    dictation.stop();
    setBusy(true);
    try {
      const note = await createNote(content, passageId);
      setNotes((ns) => [note, ...ns]);
      setDraft("");
      setComposing(false);
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <p className="note-hint">Sign in to keep notes.</p>;
  }

  return (
    <div className="passage-notes">
      {notes.map((n) => (
        <div key={n.id} className="margin-note">
          <p>{n.content}</p>
        </div>
      ))}
      {composing ? (
        <div className="note-compose">
          <textarea
            value={draft}
            autoFocus
            rows={3}
            placeholder={
              dictation.listening ? "Listening…" : "A note in the margin…"
            }
            onChange={(e) => setDraft(e.target.value)}
          />
          {dictation.interim && (
            <div className="dictation-interim">{dictation.interim}…</div>
          )}
          <div className="note-compose-actions">
            <MicButton dictation={dictation} />
            <button onClick={save} disabled={busy || !draft.trim()}>
              Save note
            </button>
            <button
              className="auth-link"
              onClick={() => {
                dictation.stop();
                setComposing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="auth-link note-add" onClick={() => setComposing(true)}>
          Add a note
        </button>
      )}
    </div>
  );
}

export default function Reading({
  user,
  target,
  onTargetConsumed,
  onPageChange,
}: {
  user: AuthUser | null;
  /** Navigation request from outside (sidebar TOC, journal margin-note link). */
  target: ReadingTarget | null;
  onTargetConsumed: () => void;
  /** Reports the current page (null = work picker) so the sidebar can follow. */
  onPageChange: (page: ReadingPage | null) => void;
}) {
  const [works, setWorks] = useState<Work[]>([]);
  const [page, setPage] = useState<ReadingPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorks().then(setWorks).catch((e) => setError(String(e)));
  }, []);

  const openPage = useCallback(
    (params: { work: string; offset: number } | { passageId: number }) => {
      setError(null);
      fetchReadingPage(params, 1)
        .then((p) => {
          setPage(p);
          onPageChange(p);
          localStorage.setItem(LAST_WORK_KEY, p.work);
          localStorage.setItem(posKey(p.work), String(p.offset));
        })
        .catch((e) => setError(String(e)));
    },
    [onPageChange],
  );

  const openWork = useCallback(
    (work: string) => {
      const saved = parseInt(localStorage.getItem(posKey(work)) ?? "0", 10);
      openPage({ work, offset: Number.isFinite(saved) ? Math.max(0, saved) : 0 });
    },
    [openPage],
  );

  const showPicker = useCallback(() => {
    setPage(null);
    onPageChange(null);
  }, [onPageChange]);

  useEffect(() => {
    if (!target) return;
    if (target.kind === "picker") showPicker();
    else if (target.kind === "work") openWork(target.work);
    else if (target.kind === "position")
      openPage({ work: target.work, offset: target.offset });
    else openPage({ passageId: target.passageId });
    onTargetConsumed();
  }, [target, openPage, openWork, showPicker, onTargetConsumed]);

  const prev = useCallback(() => {
    if (page && page.offset > 0) openPage({ work: page.work, offset: page.offset - 1 });
  }, [page, openPage]);
  const next = useCallback(() => {
    if (page && page.offset + 1 < page.total)
      openPage({ work: page.work, offset: page.offset + 1 });
  }, [page, openPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next]);

  const passage = page?.passages[0];
  const workMeta = works.find((w) => w.work === page?.work);

  if (!page) {
    const lastWork = localStorage.getItem(LAST_WORK_KEY);
    return (
      <div className="reading">
        <h2 className="view-title">Stoic Texts</h2>
        <p className="intro">
          Read the Stoics straight through, a passage at a time. Your place is
          kept in each work.
        </p>
        {error && <p className="msg-error">{error}</p>}
        <div className="work-list">
          {works.map((w) => (
            <button key={w.work} className="work-card" onClick={() => openWork(w.work)}>
              <span className="work-title">{w.work}</span>
              <span className="work-author">{w.author}</span>
              <span className="work-meta">
                trans. {w.translator} · {w.passage_count} passages
                {w.work === lastWork && " · continue"}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="reading reading-pane">
      <div className="reading-header">
        <button className="auth-link" onClick={showPicker}>
          ← All works
        </button>
        <div className="reading-work">
          <span className="work-title">{page.work}</span>
          {workMeta && (
            <span className="work-meta">
              {" "}
              — {workMeta.author}, trans. {workMeta.translator}
            </span>
          )}
        </div>
      </div>
      {error && <p className="msg-error">{error}</p>}
      {passage && (
        <article className="passage-card">
          <div className="source-ref">{passage.reference}</div>
          <p className="passage-text">{passage.text}</p>
          <div className="passage-actions">
            <PlayButton src={`/api/passages/${passage.id}/audio`} />
            <PassageBreakdown key={passage.id} passageId={passage.id} />
          </div>
          <PassageNotes passageId={passage.id} user={user} />
        </article>
      )}
      <div className="pager">
        <button onClick={prev} disabled={page.offset === 0}>
          ← Previous
        </button>
        <span className="pager-pos">
          {page.offset + 1} of {page.total}
        </span>
        <button onClick={next} disabled={page.offset + 1 >= page.total}>
          Next →
        </button>
      </div>
      <p className="pager-hint">Use ← → arrow keys to turn pages.</p>
    </div>
  );
}
