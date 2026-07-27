"use client";

// Client islands for the reader pages. The passage text itself is
// server-rendered (public, indexable); these components add the signed-in
// layer on top: margin notes per passage and the mark-as-read action.
//
// AnnotationsProvider fetches the caller's notes for the whole work ONCE and
// shares them via context, so a page with forty passages costs one request.
// Signed out, every island renders nothing — public reading stays clean.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  createNote,
  deleteNote,
  fetchNotesForWork,
  fetchReadIds,
  markRead,
  updateNote,
  type MarginNote,
} from "@/lib/api";
import { useUser } from "@/lib/useUser";

const noteButtonCls =
  "rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

type AnnotationsCtx = {
  notes: MarginNote[];
  signedIn: boolean;
  addLocal: (n: MarginNote) => void;
  replaceLocal: (n: MarginNote) => void;
  removeLocal: (id: string) => void;
};

const Ctx = createContext<AnnotationsCtx | null>(null);

export function AnnotationsProvider({
  work,
  children,
}: {
  work: string;
  children: ReactNode;
}) {
  const { user } = useUser();
  const [notes, setNotes] = useState<MarginNote[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchNotesForWork(work)
      .then(setNotes)
      .catch(() => {});
  }, [user, work]);

  return (
    <Ctx.Provider
      value={{
        notes,
        signedIn: user != null,
        addLocal: (n) => setNotes((prev) => [...prev, n]),
        replaceLocal: (n) =>
          setNotes((prev) => prev.map((x) => (x.id === n.id ? n : x))),
        removeLocal: (id) =>
          setNotes((prev) => prev.filter((x) => x.id !== id)),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

function NoteCard({
  note,
  onReplace,
  onRemove,
}: {
  note: MarginNote;
  onReplace: (n: MarginNote) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-black/10 bg-black/[.02] p-3 text-sm dark:border-white/15 dark:bg-white/[.03]">
      {editing ? (
        <textarea
          className="w-full resize-y rounded border border-black/15 bg-transparent p-2 text-sm dark:border-white/20"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <p className="whitespace-pre-line leading-relaxed">{note.content}</p>
      )}
      <div className="mt-2 flex gap-2">
        {editing ? (
          <>
            <button
              className={noteButtonCls}
              disabled={busy || draft.trim().length === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  onReplace(await updateNote(note.id, draft.trim()));
                  setEditing(false);
                } catch {
                  /* keep editing */
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </button>
            <button
              className={noteButtonCls}
              disabled={busy}
              onClick={() => {
                setDraft(note.content);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className={noteButtonCls} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              className={noteButtonCls}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteNote(note.id);
                  onRemove(note.id);
                } catch {
                  setBusy(false);
                }
              }}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** The margin of one passage: existing notes plus a composer toggle. */
export function MarginNotes({ passageId }: { passageId: string }) {
  const ctx = useContext(Ctx);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ctx || !ctx.signedIn) return null;
  const mine = ctx.notes.filter((n) => n.passage_id === passageId);

  return (
    <div className="mt-2 flex flex-col gap-2">
      {mine.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          onReplace={ctx.replaceLocal}
          onRemove={ctx.removeLocal}
        />
      ))}
      {composing ? (
        <div>
          <textarea
            className="w-full resize-y rounded border border-black/15 bg-transparent p-2 text-sm dark:border-white/20"
            rows={3}
            autoFocus
            placeholder="A note in the margin…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt-1 flex gap-2">
            <button
              className={noteButtonCls}
              disabled={busy || draft.trim().length === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  ctx.addLocal(await createNote(passageId, draft.trim()));
                  setDraft("");
                  setComposing(false);
                } catch {
                  /* keep composing */
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save note
            </button>
            <button
              className={noteButtonCls}
              disabled={busy}
              onClick={() => setComposing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="self-start text-xs opacity-50 hover:opacity-100"
          onClick={() => setComposing(true)}
        >
          + Note
        </button>
      )}
    </div>
  );
}

/** Deliberate end-of-chapter action; records today's reading for the
    practice calendar. */
export function MarkReadButton({
  work,
  part,
  passageIds,
}: {
  work: string;
  part: string;
  passageIds: string[];
}) {
  const { user } = useUser();
  const [read, setRead] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchReadIds(work)
      .then((ids) => {
        const idSet = new Set(ids);
        setRead(passageIds.every((id) => idSet.has(id)));
      })
      .catch(() => {});
    // passageIds is a fresh array each render; identify it by content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, work, part]);

  if (!user) return null;

  return (
    <div className="mt-8 border-t border-black/10 pt-6 dark:border-white/15">
      {read ? (
        <p className="text-sm opacity-60">Read ✓ — recorded in your practice.</p>
      ) : (
        <button
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-85 disabled:opacity-40"
          disabled={busy || read === null}
          onClick={async () => {
            setBusy(true);
            try {
              await markRead(work, part);
              setRead(true);
            } catch {
              /* stays unread */
            } finally {
              setBusy(false);
            }
          }}
        >
          Mark as read
        </button>
      )}
    </div>
  );
}
