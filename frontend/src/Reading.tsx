import { useCallback, useEffect, useState } from "react";
import Markdown from "react-markdown";
import {
  createNote,
  fetchConversation,
  fetchNotes,
  fetchPassageThread,
  fetchRelatedNotes,
  fetchReadingPage,
  fetchWorks,
  streamChat,
  streamReflection,
  streamTranslation,
  trackReads,
  type AuthUser,
} from "./api";
import type {
  ChatMessage,
  Note,
  ReadingPage,
  ReadingPassage,
  ReadingTarget,
  Work,
} from "./types";
import { PlayButton } from "./audio";
import { MicButton, useDictation } from "./dictation";
import { MessageView } from "./Journal";

const LAST_WORK_KEY = "stoa:reading:last-work";
const SHOW_ORIGINAL_KEY = "stoa:reading:show-original";
const posKey = (work: string) => `stoa:reading:pos:${work}`;

const ORIGINAL_NAMES: Record<string, string> = { grc: "Greek", la: "Latin" };
const originalName = (p: ReadingPassage) =>
  ORIGINAL_NAMES[p.original_language ?? ""] ?? "original";

/** The passage text, either the English as ingested or streamed through the
    server-side translation cache. Mounted with key={passageId:lang} so state
    resets on page turn and language change. */
function PassageText({
  passage,
  lang,
  translator,
}: {
  passage: ReadingPassage;
  lang: string;
  translator?: string;
}) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!lang) return;
    let cancelled = false;
    streamTranslation(passage.id, lang, {
      onDelta: (d) => {
        if (!cancelled) setText((t) => t + d);
      },
      onError: () => {
        if (!cancelled) setFailed(true);
      },
      onDone: () => {
        if (!cancelled) setDone(true);
      },
    });
    return () => {
      cancelled = true;
    };
  }, [passage.id, lang]);

  if (!lang) return <p className="passage-text">{passage.text}</p>;
  if (failed)
    return (
      <>
        <p className="side-hint">Translation unavailable — showing the English.</p>
        <p className="passage-text">{passage.text}</p>
      </>
    );
  if (!text) return <div className="thinking">Translating&hellip;</div>;
  return (
    <>
      <p className="passage-text">{text}</p>
      {done && (
        <p className="translation-credit">
          {passage.original_text
            ? `Translated by the Stoa from the ${originalName(passage)}` +
              (translator ? `, after the English of ${translator}` : "")
            : "Translated by the Stoa" +
              (translator ? ` from the English of ${translator}` : "")}
        </p>
      )}
    </>
  );
}

/** On-demand LLM breakdown of the visible passage (cached server-side).
    Mounted with key={passageId:lang} so state resets on page turn and
    language change. */
function PassageBreakdown({
  passageId,
  lang,
}: {
  passageId: number;
  lang: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [started, setStarted] = useState(false);

  const toggle = () => {
    if (!started) {
      setStarted(true);
      setStreaming(true);
      streamReflection(passageId, lang, {
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
            <>
              {!streaming && (
                <div className="breakdown-audio">
                  <PlayButton
                    src={`/api/reflection/${passageId}/audio${
                      lang ? `?language=${encodeURIComponent(lang)}` : ""
                    }`}
                    title="Listen to the breakdown"
                  />
                </div>
              )}
              <Markdown>{text}</Markdown>
            </>
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

const snippet = (text: string, max = 150) =>
  text.length > max ? text.slice(0, max).trimEnd() + "…" : text;

/** Cross-link (Stoa Plus): the reader's own journal entries that speak to
    the visible passage. Silent when there are none — a suggestion, not a
    section. Mounted with key={passageId} so results reset on page turn. */
function FromYourJournal({
  passageId,
  isPlus,
  onOpenNote,
}: {
  passageId: number;
  isPlus: boolean;
  onOpenNote: (noteId: string) => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (!isPlus) return;
    let cancelled = false;
    fetchRelatedNotes(passageId).then((ns) => {
      if (!cancelled) setNotes(ns);
    });
    return () => {
      cancelled = true;
    };
  }, [passageId, isPlus]);

  if (notes.length === 0) return null;
  return (
    <div className="related-block">
      <div className="pane-caption">From your journal</div>
      {notes.map((n) => (
        <button
          key={n.id}
          className="related-item"
          onClick={() => onOpenNote(n.id)}
        >
          <span className="related-ref">
            {new Date(n.created_at).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
            })}
            {n.passage ? ` · on ${n.passage.reference}` : ""}
          </span>
          <span className="related-snippet">{snippet(n.content)}</span>
        </button>
      ))}
    </div>
  );
}

/** A discussion thread anchored to the visible passage (Stoa Plus).
    Mounted with key={passageId} so all state resets on page turn. The thread
    is seeded server-side with the passage + its breakdown, so the Stoa's
    replies stay grounded in what's on screen. */
function PassageDiscussion({
  passageId,
  user,
  lang,
  isPlus,
  onShowPlans,
}: {
  passageId: number;
  user: AuthUser | null;
  lang: string;
  isPlus: boolean;
  onShowPlans: () => void;
}) {
  // undefined = still checking whether a thread exists.
  const [threadId, setThreadId] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const dictation = useDictation((t) =>
    setDraft((d) => (d ? d.trimEnd() + " " + t : t)),
  );

  useEffect(() => {
    if (!user || !isPlus) {
      setThreadId(null);
      return;
    }
    let cancelled = false;
    fetchPassageThread(passageId).then((id) => {
      if (!cancelled) setThreadId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [passageId, user, isPlus]);

  const updateLast = (patch: (m: ChatMessage) => ChatMessage) =>
    setMsgs((ms) => [...ms.slice(0, -1), patch(ms[ms.length - 1])]);

  async function openExisting() {
    setOpen(true);
    if (msgs.length > 0 || !threadId) return;
    const c = await fetchConversation(threadId);
    if (!c) return;
    let ms: ChatMessage[] = c.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    // Hide the seed (the passage quote + breakdown) — it's already on screen.
    if (ms[0]?.role === "assistant" && ms[0].content.startsWith("> ")) {
      ms = ms.slice(1);
    }
    setMsgs(ms);
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    dictation.stop();
    setDraft("");
    setBusy(true);
    const starting = !threadId;
    setMsgs((ms) => [
      ...ms,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    try {
      await streamChat(
        text,
        threadId ?? null,
        {
          onMeta: (meta) => setThreadId(meta.conversation_id),
          onDelta: (d) => updateLast((m) => ({ ...m, content: m.content + d })),
          onError: (error) => updateLast((m) => ({ ...m, error })),
          onDone: () => {},
          onCapHit: (info) =>
            updateLast((m) => ({
              ...m,
              error: info.message ?? "This needs Stoa Plus.",
            })),
        },
        undefined,
        undefined,
        lang,
        starting ? passageId : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  if (!isPlus) {
    return (
      <div className="passage-discussion">
        <button className="auth-link" onClick={onShowPlans}>
          Discuss with the Stoa — a Stoa Plus feature
        </button>
      </div>
    );
  }
  if (threadId === undefined) return null;

  if (!open) {
    return (
      <div className="passage-discussion">
        <button
          className="auth-link"
          onClick={() => (threadId ? openExisting() : setOpen(true))}
        >
          {threadId ? "Continue the discussion" : "Discuss with the Stoa"}
        </button>
      </div>
    );
  }

  return (
    <div className="passage-discussion">
      <button
        className="auth-link entry-thread-toggle"
        onClick={() => setOpen(false)}
      >
        Hide discussion
      </button>
      {msgs.map((m, i) => (
        <MessageView key={i} message={m} />
      ))}
      {busy && msgs[msgs.length - 1]?.content === "" && (
        <div className="thinking">Consulting the Stoics&hellip;</div>
      )}
      {dictation.interim && (
        <div className="dictation-interim">{dictation.interim}…</div>
      )}
      <div className="thread-composer">
        <textarea
          rows={2}
          value={draft}
          placeholder={
            dictation.listening
              ? "Listening…"
              : msgs.length === 0
                ? "What does this passage stir up?"
                : "Continue the discussion…"
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={busy}
        />
        <MicButton dictation={dictation} />
        <button onClick={send} disabled={busy || !draft.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

export default function Reading({
  user,
  target,
  onTargetConsumed,
  onPageChange,
  lang,
  isPlus,
  onShowPlans,
  onOpenNote,
}: {
  user: AuthUser | null;
  /** Navigation request from outside (sidebar TOC, journal margin-note link). */
  target: ReadingTarget | null;
  onTargetConsumed: () => void;
  /** Reports the current page (null = work picker) so the sidebar can follow. */
  onPageChange: (page: ReadingPage | null) => void;
  /** App-wide reading language ("" = published English), set in the account
      settings (Account & plan → Preferences). */
  lang: string;
  /** Uncapped account (Plus or superuser): passage discussions available. */
  isPlus: boolean;
  /** Open the account/upgrade view (Stoa Plus pitch). */
  onShowPlans: () => void;
  /** Open a journal entry (cross-links from a passage to the journal). */
  onOpenNote: (noteId: string) => void;
}) {
  const [works, setWorks] = useState<Work[]>([]);
  const [page, setPage] = useState<ReadingPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(
    () => localStorage.getItem(SHOW_ORIGINAL_KEY) === "1",
  );

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
          trackReads(p.passages.map((x) => x.id));
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
          {passage.original_text && showOriginal && (
            <div className="original-block">
              <p className="passage-text original-text">{passage.original_text}</p>
              {passage.original_source && (
                <p className="translation-credit">
                  {ORIGINAL_NAMES[passage.original_language ?? ""] ?? "Original"}{" "}
                  text: {passage.original_source}
                </p>
              )}
            </div>
          )}
          <PassageText
            key={`${passage.id}:${lang}`}
            passage={passage}
            lang={lang}
            translator={workMeta?.translator}
          />
          <div className="passage-actions">
            <PlayButton src={`/api/passages/${passage.id}/audio`} />
            <PassageBreakdown
              key={`${passage.id}:${lang}`}
              passageId={passage.id}
              lang={lang}
            />
            {passage.original_text && (
              <button
                className="auth-link"
                onClick={() => {
                  const next = !showOriginal;
                  setShowOriginal(next);
                  localStorage.setItem(SHOW_ORIGINAL_KEY, next ? "1" : "");
                }}
              >
                {showOriginal
                  ? `Hide the ${originalName(passage)}`
                  : `Show the ${originalName(passage)}`}
              </button>
            )}
          </div>
          <PassageNotes passageId={passage.id} user={user} />
          <FromYourJournal
            key={`related:${passage.id}`}
            passageId={passage.id}
            isPlus={isPlus}
            onOpenNote={onOpenNote}
          />
          <PassageDiscussion
            key={`discuss:${passage.id}`}
            passageId={passage.id}
            user={user}
            lang={lang}
            isPlus={isPlus}
            onShowPlans={onShowPlans}
          />
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
