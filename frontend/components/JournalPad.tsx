"use client";

// The right panel of the landing page. Signed out it invites signup —
// journaling is the reason to make an account. Signed in it is the working
// pad: write freely, and the day's entries collect beneath.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import BoldMarkdown from "@/components/BoldMarkdown";
import {
  createJournalEntry,
  deleteJournalEntry,
  fetchJournal,
  fetchJournalStats,
  reflectOnEntry,
  ReflectionCapError,
  updateJournalEntry,
  type JournalEntry,
  type JournalStats,
} from "@/lib/api";
import { useUser } from "@/lib/useUser";

const buttonCls =
  "rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-85 disabled:opacity-40";
const subtleButtonCls =
  "rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

export function EntryCard({
  entry,
  onChanged,
  reflecting = false,
}: {
  entry: JournalEntry;
  onChanged: () => void;
  /** True while this entry's reflection is being written. */
  reflecting?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const when = new Date(entry.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/15">
      <div className="mb-2 flex items-center gap-2 text-xs opacity-60">
        <span>{when}</span>
        <span className="ml-auto flex gap-2">
          {editing ? (
            <>
              <button
                className={subtleButtonCls}
                disabled={busy || draft.trim().length === 0}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await updateJournalEntry(entry.id, draft.trim());
                    setEditing(false);
                    onChanged();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Save failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save
              </button>
              <button
                className={subtleButtonCls}
                disabled={busy}
                onClick={() => {
                  setDraft(entry.content);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className={subtleButtonCls} onClick={() => setEditing(true)}>
                Edit
              </button>
              <button
                className={subtleButtonCls}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await deleteJournalEntry(entry.id);
                    onChanged();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Delete failed");
                    setBusy(false);
                  }
                }}
              >
                Delete
              </button>
            </>
          )}
        </span>
      </div>
      {editing ? (
        <textarea
          className="w-full resize-y rounded border border-black/15 bg-transparent p-2 text-sm dark:border-white/20"
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <p className="whitespace-pre-line text-sm leading-relaxed">
          {entry.content}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {entry.reflection ? (
        <div className="mt-3 border-l-2 border-black/15 pl-3 dark:border-white/25">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-50">
            Reflection
          </p>
          <BoldMarkdown text={entry.reflection} />
        </div>
      ) : reflecting ? (
        <p className="mt-3 text-xs italic opacity-50">Reflecting…</p>
      ) : null}
    </div>
  );
}

export default function JournalPad({
  passageId,
}: {
  passageId?: string | null;
}) {
  const { user, loading } = useUser();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The entry whose reflection is currently being written, and the quiet
  // notice shown when one couldn't be (cap hit, generation unavailable).
  const [reflectingId, setReflectingId] = useState<string | null>(null);
  const [reflectNotice, setReflectNotice] = useState<React.ReactNode>(null);

  const reload = useCallback(() => {
    fetchJournal()
      .then(setEntries)
      .catch(() => {});
    fetchJournalStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) reload();
  }, [user, reload]);

  if (loading) return <div className="min-h-40" />;

  if (!user) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-4 rounded-xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="text-lg font-medium">Your journal</h2>
        <p className="text-sm opacity-75">
          Read the passage, then write — about it, or about whatever is on
          your mind. Your entries stay yours, kept alongside each day&apos;s
          reading.
        </p>
        <Link href="/register" className={buttonCls}>
          Start your journal
        </Link>
        <p className="text-xs opacity-60">
          Already have an account?{" "}
          <Link href="/login" className="underline hover:opacity-80">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-medium">Your journal</h2>
        {stats && stats.total_entries > 0 && (
          <span className="text-xs opacity-60">
            {stats.total_entries}{" "}
            {stats.total_entries === 1 ? "entry" : "entries"}
            {stats.streak_days > 1 && <> &middot; {stats.streak_days}-day streak</>}
          </span>
        )}
      </div>
      <textarea
        className="min-h-40 w-full resize-y rounded-xl border border-black/15 bg-transparent p-4 text-sm leading-relaxed outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        placeholder="Write about the passage, or whatever is on your mind…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button
          className={buttonCls}
          disabled={busy || draft.trim().length === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            setReflectNotice(null);
            let saved: JournalEntry;
            try {
              saved = await createJournalEntry(draft.trim(), passageId);
              setDraft("");
              reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Save failed");
              setBusy(false);
              return;
            }
            setBusy(false);
            // The entry is safe; the reflection arrives when it arrives.
            setReflectingId(saved.id);
            try {
              await reflectOnEntry(saved.id);
              reload();
            } catch (e) {
              if (e instanceof ReflectionCapError) {
                setReflectNotice(
                  <>
                    Your entry is saved. You&apos;ve used
                    {e.limit != null ? ` all ${e.limit}` : " all"} of this
                    month&apos;s free reflections —{" "}
                    <Link href="/account" className="underline">
                      upgrade to Plus
                    </Link>{" "}
                    for unlimited.
                  </>,
                );
              } else {
                setReflectNotice(
                  e instanceof Error
                    ? `Your entry is saved. ${e.message}`
                    : "Your entry is saved; the reflection couldn't be written.",
                );
              }
            } finally {
              setReflectingId(null);
            }
          }}
        >
          Save entry
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      {reflectNotice && (
        <p className="rounded-lg border border-black/15 px-3 py-2 text-xs opacity-80 dark:border-white/20">
          {reflectNotice}
        </p>
      )}

      {entries.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          <h3 className="text-sm font-medium uppercase tracking-wide opacity-60">
            Today
          </h3>
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onChanged={reload}
              reflecting={entry.id === reflectingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
