import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import {
  createNote,
  deleteNote,
  fetchConversation,
  fetchDaily,
  fetchNotes,
  fetchRelatedPassages,
  streamChat,
  streamReflection,
  streamSynthesis,
  streamTranslation,
  trackReads,
  updateNote,
  type AuthUser,
  type SynthesisMeta,
} from "./api";
import type { ChatMessage, Note, Source } from "./types";
import { CapHint } from "./Account";
import { PlayButton } from "./audio";
import { MicButton, useDictation } from "./dictation";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function SourcePanel({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <details className="sources">
      <summary>
        Grounded in {sources.length} passage{sources.length > 1 ? "s" : ""}
      </summary>
      {sources.map((s) => (
        <blockquote key={s.id} className="source-card">
          <div className="source-ref">
            {s.reference}{" "}
            <span className="source-trans">
              · {s.author}, trans. {s.translator}
            </span>
          </div>
          <p>{s.text.length > 420 ? s.text.slice(0, 420) + "…" : s.text}</p>
        </blockquote>
      ))}
    </details>
  );
}

export function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return <div className="msg msg-user">{message.content}</div>;
  }
  return (
    <div className="msg msg-assistant">
      {message.sources && <SourcePanel sources={message.sources} />}
      <div className="msg-body">
        <Markdown>{message.content}</Markdown>
      </div>
      {message.error && <div className="msg-error">{message.error}</div>}
    </div>
  );
}

function DailyQuote({
  quote,
  onReadInContext,
}: {
  quote: Source;
  onReadInContext: () => void;
}) {
  // Seneca passages can run long; keep the daily card to a card.
  const text =
    quote.text.length > 480
      ? quote.text.slice(0, 480).trimEnd().replace(/[,;:]?$/, "") + "…"
      : quote.text;
  return (
    <figure className="daily">
      <div className="daily-caption">Today's passage</div>
      <blockquote>{text}</blockquote>
      <figcaption>
        — {quote.author}, {quote.reference}
      </figcaption>
      <div className="daily-links">
        <PlayButton src={`/api/passages/${quote.id}/audio`} />
        <button className="auth-link" onClick={onReadInContext}>
          Read in context →
        </button>
      </div>
    </figure>
  );
}

/** The conversation anchored beneath a journal entry. The entry itself is the
    thread's first user message, so only what follows it is rendered here. */
function EntryThread({
  note,
  lang,
  seedPassageId,
  autoStart,
  onThreadKnown,
  capRemaining,
  onCapHit,
  onShowPlans,
}: {
  note: Note;
  /** Reading language ("" = English): the Stoa replies in it. */
  lang: string;
  /** Passage context baked into a NEW thread (daily prompt or margin note). */
  seedPassageId: number | null;
  autoStart: boolean;
  onThreadKnown: (noteId: string, threadId: string) => void;
  /** Free reflections left this month; null = unknown / not metered. */
  capRemaining: number | null;
  onCapHit: () => void;
  onShowPlans: () => void;
}) {
  const [threadId, setThreadId] = useState<string | null>(note.thread_id);
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const started = useRef(false);

  const updateLast = (patch: (m: ChatMessage) => ChatMessage) =>
    setMsgs((ms) => ms && [...ms.slice(0, -1), patch(ms[ms.length - 1])]);

  // 402 from /api/chat: note the cap inline and raise the upgrade modal.
  const capHandler = (info: { message: string | null }) => {
    updateLast((m) => ({
      ...m,
      error: info.message ?? "You've used this month's free reflections.",
    }));
    onCapHit();
  };

  const startThread = useCallback(() => {
    if (started.current || threadId) return;
    started.current = true;
    setOpen(true);
    setBusy(true);
    setMsgs([{ role: "assistant", content: "" }]);
    streamChat(
      note.content,
      null,
      {
        onMeta: (meta) => {
          setThreadId(meta.conversation_id);
          onThreadKnown(note.id, meta.conversation_id);
        },
        onDelta: (d) => updateLast((m) => ({ ...m, content: m.content + d })),
        onError: (error) => updateLast((m) => ({ ...m, error })),
        onDone: () => setBusy(false),
        onCapHit: capHandler,
      },
      seedPassageId ?? undefined,
      note.id,
      lang,
    ).catch(() => setBusy(false));
  }, [note, threadId, seedPassageId, onThreadKnown, lang]);

  useEffect(() => {
    if (autoStart) startThread();
  }, [autoStart, startThread]);

  async function openExisting() {
    setOpen(true);
    if (msgs !== null || !threadId) return;
    const c = await fetchConversation(threadId);
    if (!c) return;
    let ms: ChatMessage[] = c.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    // Hide the passage seed and the entry's own text (already shown above).
    if (ms[0]?.role === "assistant" && ms[0].content.startsWith("> ")) {
      ms = ms.slice(1);
    }
    if (ms[0]?.role === "user") ms = ms.slice(1);
    setMsgs(ms);
  }

  // The split layout makes the left pane the reflection's home: surface an
  // existing thread as soon as its entry opens, not behind a click.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !note.thread_id) return;
    autoOpened.current = true;
    openExisting();
  });

  // Follow the stream: keep the scrolling pane pinned to the bottom while a
  // response arrives, but let go the moment the reader scrolls up.
  const rootRef = useRef<HTMLDivElement>(null);
  const streamedLen = msgs?.length ? msgs[msgs.length - 1].content.length : 0;
  useEffect(() => {
    if (!busy) return;
    const pane = rootRef.current?.closest(".journal-pane");
    if (!pane) return;
    const nearBottom =
      pane.scrollHeight - pane.scrollTop - pane.clientHeight < 160;
    if (nearBottom) pane.scrollTop = pane.scrollHeight;
  }, [busy, streamedLen]);

  const dictation = useDictation((t) =>
    setDraft((d) => (d ? d.trimEnd() + " " + t : t)),
  );

  async function followUp() {
    const text = draft.trim();
    if (!text || busy || !threadId) return;
    dictation.stop();
    setDraft("");
    setBusy(true);
    setMsgs((ms) => [
      ...(ms ?? []),
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    try {
      await streamChat(
        text,
        threadId,
        {
          onMeta: () => {},
          onDelta: (d) => updateLast((m) => ({ ...m, content: m.content + d })),
          onError: (error) => updateLast((m) => ({ ...m, error })),
          onDone: () => {},
          onCapHit: capHandler,
        },
        undefined,
        undefined,
        lang,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!threadId && !started.current) {
    return (
      <div className="entry-thread-start">
        <button className="auth-link" onClick={startThread}>
          Reflect with the Stoa
        </button>
      </div>
    );
  }

  return (
    <div className="entry-thread" ref={rootRef}>
      {!open ? (
        <button className="auth-link entry-thread-toggle" onClick={openExisting}>
          Show reflection
        </button>
      ) : (
        <>
          <button
            className="auth-link entry-thread-toggle"
            onClick={() => setOpen(false)}
          >
            Hide reflection
          </button>
          {(msgs ?? []).map((m, i) => (
            <MessageView key={i} message={m} />
          ))}
          {busy && msgs && msgs[msgs.length - 1]?.content === "" && (
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
                dictation.listening ? "Listening…" : "Continue the reflection…"
              }
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  followUp();
                }
              }}
              disabled={busy || !threadId}
            />
            <MicButton dictation={dictation} />
            <button onClick={followUp} disabled={busy || !draft.trim() || !threadId}>
              Send
            </button>
          </div>
          <CapHint remaining={capRemaining} onShowPlans={onShowPlans} />
        </>
      )}
    </div>
  );
}

/** Monday (local) of the week containing d. */
function mondayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** The Stoa's weekly synthesis (Stoa Plus): a week of entries reflected back
    as one piece. Peeks for a stored synthesis on load; *generating* is always
    an explicit click, never an autoplay LLM call. Free accounts see a quiet
    pointer only once they have a week worth synthesizing. */
function WeekSynthesis({
  notes,
  lang,
  isPlus,
  onShowPlans,
}: {
  notes: Note[];
  lang: string;
  isPlus: boolean;
  onShowPlans: () => void;
}) {
  const thisMonday = mondayOf(new Date());
  const lastMonday = new Date(
    thisMonday.getFullYear(),
    thisMonday.getMonth(),
    thisMonday.getDate() - 7,
  );
  const countIn = (start: Date) => {
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return notes.filter((n) => {
      const t = new Date(n.created_at);
      return t >= start && t < end;
    }).length;
  };
  // A synthesis of one entry would just paraphrase it — wait for a real week.
  const week =
    countIn(thisMonday) >= 2
      ? thisMonday
      : countIn(lastMonday) >= 2
        ? lastMonday
        : null;
  const weekStart = week ? localIso(week) : null;
  const isCurrentWeek = week === thisMonday;

  const [content, setContent] = useState("");
  const [meta, setMeta] = useState<SynthesisMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);

  const run = useCallback(
    (mode: { peek?: boolean; refresh?: boolean }) => {
      if (!weekStart) return;
      const t = ++token.current;
      const fresh = () => token.current === t;
      setBusy(true);
      setError(null);
      setContent("");
      streamSynthesis(weekStart, { language: lang, ...mode }, {
        onMeta: (m) => {
          if (fresh()) setMeta(m);
        },
        onDelta: (d) => {
          if (fresh()) setContent((c) => c + d);
        },
        onError: (e) => {
          if (fresh()) setError(e);
        },
        onDone: () => {
          if (fresh()) setBusy(false);
        },
        onPlusRequired: onShowPlans,
      });
    },
    [weekStart, lang, onShowPlans],
  );

  useEffect(() => {
    if (isPlus && weekStart) run({ peek: true });
  }, [isPlus, weekStart, run]);

  if (!weekStart) return null;
  const caption = isCurrentWeek ? "Your week" : "Last week";

  if (!isPlus) {
    return (
      <div className="week-synthesis">
        <div className="pane-caption">{caption}</div>
        <p className="synthesis-pitch">
          With{" "}
          <button className="auth-link" onClick={onShowPlans}>
            Stoa Plus
          </button>
          , the Stoa reads your week of entries and reflects its threads back
          to you.
        </p>
      </div>
    );
  }

  const newEntries = meta ? meta.entry_count - meta.covered_count : 0;
  return (
    <div className="week-synthesis">
      <div className="pane-caption">{caption}</div>
      {content ? (
        <div className="synthesis-body">
          <Markdown>{content}</Markdown>
        </div>
      ) : busy ? (
        <div className="thinking">Reading your week&hellip;</div>
      ) : meta && !meta.exists ? (
        <button className="auth-link" onClick={() => run({})}>
          Synthesize {isCurrentWeek ? "your week so far" : "last week"}
        </button>
      ) : null}
      {error && <p className="msg-error">{error}</p>}
      {content && !busy && newEntries > 0 && (
        <button
          className="auth-link synthesis-refresh"
          onClick={() => run({ refresh: true })}
        >
          Weave in {newEntries} newer {newEntries === 1 ? "entry" : "entries"}
        </button>
      )}
    </div>
  );
}

/** Cross-link (Stoa Plus): passages that speak to the open entry. Silent
    when nothing resonates. Mounted with key={noteId} so results reset when
    another entry opens. */
function KindredPassages({
  noteId,
  isPlus,
  onOpenPassage,
}: {
  noteId: string;
  isPlus: boolean;
  onOpenPassage: (passageId: number) => void;
}) {
  const [passages, setPassages] = useState<Source[]>([]);

  useEffect(() => {
    if (!isPlus) return;
    let cancelled = false;
    fetchRelatedPassages(noteId).then((ps) => {
      if (!cancelled) setPassages(ps);
    });
    return () => {
      cancelled = true;
    };
  }, [noteId, isPlus]);

  if (passages.length === 0) return null;
  return (
    <div className="related-block">
      <div className="pane-caption">Passages that speak to this</div>
      {passages.map((p) => (
        <button
          key={p.id}
          className="related-item"
          onClick={() => onOpenPassage(p.id)}
        >
          <span className="related-ref">
            {p.author}, {p.reference}
          </span>
          <span className="related-snippet">
            {p.text.length > 150 ? p.text.slice(0, 150).trimEnd() + "…" : p.text}
          </span>
        </button>
      ))}
    </div>
  );
}

function NoteEntry({
  note,
  onChanged,
  onDeleted,
  onOpenPassage,
}: {
  note: Note;
  onChanged: (n: Note) => void;
  onDeleted: (id: string) => void;
  onOpenPassage: (passageId: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [busy, setBusy] = useState(false);

  async function save() {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      onChanged(await updateNote(note.id, content));
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteNote(note.id);
      onDeleted(note.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="journal-entry" id={`note-${note.id}`}>
      <header className="journal-entry-head">
        <span className="journal-date">{formatDate(note.created_at)}</span>
        {note.passage && (
          <button
            className="auth-link journal-passage-link"
            onClick={() => onOpenPassage(note.passage!.id)}
          >
            on {note.passage.reference}
          </button>
        )}
      </header>
      {editing ? (
        <div className="note-compose">
          <textarea
            value={draft}
            rows={4}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="note-compose-actions">
            <button onClick={save} disabled={busy || !draft.trim()}>
              Save
            </button>
            <button
              className="auth-link"
              onClick={() => {
                setDraft(note.content);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="journal-content">{note.content}</p>
      )}
      {!editing && (
        <footer className="journal-entry-actions">
          <button className="auth-link" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="auth-link" onClick={remove} disabled={busy}>
            Delete
          </button>
        </footer>
      )}
    </article>
  );
}

export default function Journal({
  user,
  lang,
  openNoteId,
  onOpenNote,
  onOpenPassage,
  onMutated,
  onGoToTexts,
  onSignIn,
  capRemaining,
  onCapHit,
  onShowPlans,
  isPlus,
}: {
  user: AuthUser | null;
  /** App-wide reading language ("" = published English); the daily passage
      is shown translated when set. */
  lang: string;
  /** The single past entry shown below the composer (picked in the sidebar
      or just saved); null shows none. */
  openNoteId: string | null;
  onOpenNote: (id: string | null) => void;
  onOpenPassage: (passageId: number) => void;
  /** Called after any create/edit/delete so the sidebar can refresh. */
  onMutated: () => void;
  onGoToTexts: () => void;
  onSignIn: () => void;
  /** Free reflections left this month; null = unknown / not metered. */
  capRemaining: number | null;
  /** A reflection request came back 402 (monthly cap reached). */
  onCapHit: () => void;
  /** Open the account/upgrade view (Stoa Plus pitch). */
  onShowPlans: () => void;
  /** Uncapped account (Plus or superuser): weekly synthesis is available. */
  isPlus: boolean;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Today's prompt: passage + streamed breakdown from the Stoa.
  const [prompt, setPrompt] = useState<{
    passage: Source;
    reflection: string;
    done: boolean;
    error: string | null;
  } | null>(null);
  const promptToken = useRef(0);
  // Entry that should immediately open its reflection thread after saving.
  const [autoReflectId, setAutoReflectId] = useState<string | null>(null);
  // Daily passage in the chosen language; swapped in whole once complete
  // (instant on revisits — the server caches translations forever).
  const [dailyTranslated, setDailyTranslated] = useState<string | null>(null);
  const dictation = useDictation((t) =>
    setDraft((d) => (d ? d.trimEnd() + " " + t : t)),
  );

  useEffect(() => {
    fetchDaily().then((p) => {
      if (!p) return;
      trackReads([p.id]); // the daily passage counts as read
      setPrompt({ passage: p, reflection: "", done: false, error: null });
    });
  }, []);

  const dailyId = prompt?.passage.id;

  // The breakdown streams per (passage, language): switching language mid-
  // session restreams it (instant when the server has it cached).
  useEffect(() => {
    if (dailyId == null) return;
    const token = ++promptToken.current;
    const fresh = () => promptToken.current === token;
    setPrompt((s) => s && { ...s, reflection: "", done: false, error: null });
    streamReflection(dailyId, lang, {
      onMeta: () => {},
      onDelta: (d) => {
        if (fresh())
          setPrompt((s) => s && { ...s, reflection: s.reflection + d });
      },
      onError: (e) => {
        if (fresh()) setPrompt((s) => s && { ...s, error: e });
      },
      onDone: () => {
        if (fresh()) setPrompt((s) => s && { ...s, done: true });
      },
    });
  }, [dailyId, lang]);
  useEffect(() => {
    setDailyTranslated(null);
    if (!lang || dailyId == null) return;
    let cancelled = false;
    let acc = "";
    streamTranslation(dailyId, lang, {
      onDelta: (d) => {
        acc += d;
      },
      onError: () => {},
      onDone: () => {
        if (!cancelled && acc) setDailyTranslated(acc);
      },
    });
    return () => {
      cancelled = true;
    };
  }, [dailyId, lang]);

  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    fetchNotes()
      .then((ns) => {
        if (!cancelled) setNotes(ns);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function compose(reflect: boolean) {
    const content = draft.trim();
    if (!content || busy) return;
    dictation.stop();
    setBusy(true);
    setError(null);
    try {
      const note = await createNote(content);
      setNotes((ns) => [note, ...ns]);
      setDraft("");
      onMutated();
      onOpenNote(note.id);
      if (reflect) setAutoReflectId(note.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Passage context for a note's new thread: today's passage for entries
      reflected right after writing; a margin note's own passage otherwise. */
  const seedFor = (note: Note): number | null => {
    if (note.id === autoReflectId) return prompt?.passage.id ?? null;
    return note.passage_id;
  };

  const openNote = openNoteId ? notes.find((n) => n.id === openNoteId) : undefined;

  // The thread sits below the passage + breakdown in the left pane; bring it
  // into view when an entry opens so a streaming reflection isn't invisible.
  const threadRef = useRef<HTMLDivElement>(null);
  const openId = openNote?.id;
  useEffect(() => {
    if (openId)
      threadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openId]);

  return (
    <div className="journal">
      <h2 className="view-title">Journal</h2>

      <div className="journal-split">
        {/* Left: the Stoa's voice — today's passage, its breakdown, and the
            reflection thread for whichever entry is open. */}
        <section className="journal-pane stoa-pane" aria-label="Daily passage and reflection">
          {prompt && (
            <>
              <DailyQuote
                quote={
                  dailyTranslated
                    ? { ...prompt.passage, text: dailyTranslated }
                    : prompt.passage
                }
                onReadInContext={() => onOpenPassage(prompt.passage.id)}
              />
              {prompt.reflection ? (
                <div className="daily-breakdown">
                  {prompt.done && (
                    <div className="breakdown-audio">
                      <PlayButton
                        src={`/api/reflection/${prompt.passage.id}/audio${
                          lang ? `?language=${encodeURIComponent(lang)}` : ""
                        }`}
                        title="Listen to the breakdown"
                      />
                    </div>
                  )}
                  <Markdown>{prompt.reflection}</Markdown>
                </div>
              ) : prompt.error ? null : (
                <div className="thinking">Reading today's passage&hellip;</div>
              )}
            </>
          )}

          {openNote && (
            <div className="stoa-thread" ref={threadRef}>
              <div className="pane-caption">Reflection</div>
              <EntryThread
                key={openNote.id}
                note={openNote}
                lang={lang}
                seedPassageId={seedFor(openNote)}
                autoStart={openNote.id === autoReflectId}
                capRemaining={capRemaining}
                onCapHit={onCapHit}
                onShowPlans={onShowPlans}
                onThreadKnown={(noteId, threadId) =>
                  setNotes((ns) =>
                    ns.map((x) =>
                      x.id === noteId ? { ...x, thread_id: threadId } : x,
                    ),
                  )
                }
              />
            </div>
          )}

          {user && (
            <WeekSynthesis
              notes={notes}
              lang={lang}
              isPlus={isPlus}
              onShowPlans={onShowPlans}
            />
          )}
        </section>

        {/* Right: your writing — the editor, or the entry picked in the
            sidebar. */}
        <section className="journal-pane entry-pane" aria-label="Journal entry">
          {user ? (
            openNote ? (
              <>
                <div className="entry-pane-bar">
                  <button className="auth-link" onClick={() => onOpenNote(null)}>
                    ← New entry
                  </button>
                </div>
                <NoteEntry
                  key={openNote.id}
                  note={openNote}
                  onChanged={(updated) => {
                    setNotes((ns) =>
                      ns.map((x) => (x.id === updated.id ? updated : x)),
                    );
                    onMutated();
                  }}
                  onDeleted={(id) => {
                    setNotes((ns) => ns.filter((x) => x.id !== id));
                    onOpenNote(null);
                    onMutated();
                  }}
                  onOpenPassage={onOpenPassage}
                />
                <KindredPassages
                  key={`kindred:${openNote.id}`}
                  noteId={openNote.id}
                  isPlus={isPlus}
                  onOpenPassage={onOpenPassage}
                />
              </>
            ) : (
              <div className="note-compose journal-compose">
                <textarea
                  value={draft}
                  placeholder={
                    dictation.listening
                      ? "Listening — speak what's on your mind…"
                      : "Respond to today's passage — or write what's on your mind"
                  }
                  onChange={(e) => setDraft(e.target.value)}
                />
                {dictation.interim && (
                  <div className="dictation-interim">{dictation.interim}…</div>
                )}
                <div className="note-compose-actions">
                  <MicButton dictation={dictation} />
                  <button
                    onClick={() => compose(true)}
                    disabled={busy || !draft.trim()}
                  >
                    Save &amp; reflect with the Stoa
                  </button>
                  <button
                    className="auth-link"
                    onClick={() => compose(false)}
                    disabled={busy || !draft.trim()}
                  >
                    Just save
                  </button>
                </div>
                <CapHint remaining={capRemaining} onShowPlans={onShowPlans} />
              </div>
            )
          ) : (
            <p className="intro">
              <button className="auth-link" onClick={onSignIn}>
                Sign in
              </button>{" "}
              to keep a journal — daily reflections on the texts, notes in the
              margins, and the Stoa to think alongside you.
            </p>
          )}

          {error && <p className="msg-error">{error}</p>}

          {user && !openNote && notes.length === 0 && (
            <p className="intro">
              Nothing here yet. Marcus Aurelius wrote his <em>Meditations</em>{" "}
              for no reader but himself — begin yours here, or leave a note in
              the margins{" "}
              <button className="auth-link" onClick={onGoToTexts}>
                as you read
              </button>
              .
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
