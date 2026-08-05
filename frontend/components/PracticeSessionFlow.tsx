"use client";

// One sitting of practice. Takes over the practice page while active: a
// running timer against the standing intention, the guide's steps one at a
// time (or a freeform pad), and an End button that records the session.
// Prompt steps save real journal entries — the session leaves the same
// traces on the calendar as practicing piecemeal would.
import { useEffect, useRef, useState } from "react";
import BoldMarkdown from "@/components/BoldMarkdown";
import { PlayButton } from "@/components/PlayButton";
import {
  breakdownAudioUrl,
  createJournalEntry,
  endPracticeSession,
  fetchDaily,
  fetchIntention,
  passageAudioUrl,
  reflectOnEntry,
  startPracticeSession,
  type Daily,
  type Guide,
  type PracticeSession,
} from "@/lib/api";
import { type QueueItem } from "@/lib/narration";

const subtleButtonCls =
  "rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";
const primaryButtonCls =
  "rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-85 disabled:opacity-40";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The day's passage with its reflection — inside a session the two read as
    one piece, so the passage's listen button narrates straight through both.
    Shared with the spoken flow (SpokenSessionFlow). */
export function PassageBlock({ daily }: { daily: Daily }) {
  const queue = (): QueueItem[] => {
    const items: QueueItem[] = [
      {
        src: passageAudioUrl(daily.passage.id),
        passageId: daily.passage.id,
        kind: "passage",
      },
    ];
    if (daily.breakdown)
      items.push({
        src: breakdownAudioUrl(daily.passage.id),
        passageId: daily.passage.id,
        kind: "breakdown",
      });
    return items;
  };
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-medium">
        {daily.passage.reference}
        <PlayButton
          src={passageAudioUrl(daily.passage.id)}
          title={`Listen to ${daily.passage.reference}`}
          queueFrom={queue}
        />
      </p>
      <blockquote className="mt-2 whitespace-pre-line text-sm leading-relaxed opacity-90">
        {daily.passage.text}
      </blockquote>
      {daily.breakdown && (
        <div className="mt-4 border-l-2 border-black/15 pl-3 dark:border-white/25">
          <p className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide opacity-50">
            Reflection
            <PlayButton
              src={breakdownAudioUrl(daily.passage.id)}
              title="Listen to the reflection"
            />
          </p>
          <BoldMarkdown text={daily.breakdown} />
        </div>
      )}
    </div>
  );
}

export default function PracticeSessionFlow({
  guide,
  onDone,
}: {
  guide: Guide | null;
  onDone: () => void;
}) {
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [targetMinutes, setTargetMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const completedRef = useRef<string[]>([]);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    startPracticeSession(guide?.key ?? null)
      .then((s) => {
        setSession(s);
        startedAtRef.current = Date.now();
      })
      .catch(() => setError("Could not start the session — try again."));
    fetchDaily()
      .then(setDaily)
      .catch(() => {});
    fetchIntention()
      .then((i) => setTargetMinutes(i ? i.minutes_per_day : null))
      .catch(() => {});
    const tick = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)),
      1000,
    );
    return () => clearInterval(tick);
  }, [guide]);

  const steps = guide?.steps ?? [];
  const step = stepIdx < steps.length ? steps[stepIdx] : null;
  const finishedSteps = guide !== null && stepIdx >= steps.length;

  const markAndAdvance = (key?: string) => {
    if (key && !completedRef.current.includes(key))
      completedRef.current.push(key);
    setDraft("");
    setStepIdx((i) => i + 1);
  };

  // Entries saved in a session get the same automatic reflection the pad
  // gives — generated in the background, read later on the day's review.
  // Best-effort: out of free turns (or any failure) just means no reflection.
  const reflectQuietly = (entryId: string) => {
    void reflectOnEntry(entryId).catch(() => {});
  };

  const savePrompt = async () => {
    if (!step || !draft.trim()) return;
    setBusy(true);
    try {
      const entry = await createJournalEntry(
        `${step.title}\n\n${draft.trim()}`,
        daily?.passage.id ?? null,
      );
      reflectQuietly(entry.id);
      markAndAdvance(step.key);
    } catch {
      setError("Could not save that entry — it is kept above, try again.");
    } finally {
      setBusy(false);
    }
  };

  const saveFreeform = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const entry = await createJournalEntry(
        draft.trim(),
        daily?.passage.id ?? null,
      );
      reflectQuietly(entry.id);
      if (!completedRef.current.includes("journal"))
        completedRef.current.push("journal");
      setDraft("");
      setSavedCount((n) => n + 1);
    } catch {
      setError("Could not save that entry — it is kept above, try again.");
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    setBusy(true);
    try {
      if (session)
        await endPracticeSession(session.id, completedRef.current);
      onDone();
    } catch {
      setError("Could not end the session — try again.");
      setBusy(false);
    }
  };

  if (error && !session) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <p className="mb-4 text-sm opacity-80">{error}</p>
        <button className={subtleButtonCls} onClick={onDone}>
          ← Back to practice
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {guide ? guide.title : "Practice"}
        </h1>
        <div className="flex items-center gap-3">
          <span
            className="rounded-full border border-black/15 px-3 py-1 text-sm tabular-nums dark:border-white/20"
            title={targetMinutes ? `Your intention: ${targetMinutes} minutes` : undefined}
          >
            {formatElapsed(elapsed)}
            {targetMinutes && (
              <span className="opacity-50"> / {targetMinutes} min</span>
            )}
          </span>
          <button className={subtleButtonCls} onClick={end} disabled={busy}>
            End session
          </button>
        </div>
      </div>

      {guide && <p className="-mt-3 text-sm opacity-60">{guide.tagline}</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Guided: one step at a time */}
      {guide && step && (
        <section className="flex flex-col gap-4 rounded-xl border border-black/10 p-5 dark:border-white/15">
          <p className="text-xs font-medium uppercase tracking-wide opacity-60">
            Step {stepIdx + 1} of {steps.length} — {step.title}
          </p>

          {step.kind === "passage" ? (
            <>
              <p className="text-sm opacity-70">{step.body}</p>
              {daily ? (
                <PassageBlock daily={daily} />
              ) : (
                <p className="text-sm opacity-60">Loading today’s passage…</p>
              )}
              <div className="flex gap-2">
                <button
                  className={primaryButtonCls}
                  onClick={() => markAndAdvance(step.key)}
                >
                  Done — continue
                </button>
                <button
                  className={subtleButtonCls}
                  onClick={() => markAndAdvance()}
                >
                  Skip
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm opacity-70">{step.body}</p>
              <textarea
                className="min-h-32 w-full rounded-lg border border-black/15 bg-transparent p-3 text-sm leading-relaxed outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
                placeholder="Write here…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  className={primaryButtonCls}
                  onClick={savePrompt}
                  disabled={busy || !draft.trim()}
                >
                  Save & continue
                </button>
                <button
                  className={subtleButtonCls}
                  onClick={() => markAndAdvance()}
                >
                  Skip
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* Guided: all steps done */}
      {finishedSteps && (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-black/10 p-5 dark:border-white/15">
          <p className="text-sm">
            That’s the whole {guide!.title.toLowerCase()} —{" "}
            {completedRef.current.length} of {steps.length} steps done in{" "}
            {formatElapsed(elapsed)}. Stay as long as you like.
          </p>
          <button className={primaryButtonCls} onClick={end} disabled={busy}>
            End session
          </button>
        </section>
      )}

      {/* Freeform: the passage and an open pad, no prescribed order */}
      {!guide && (
        <>
          <section className="rounded-xl border border-black/10 p-5 dark:border-white/15">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide opacity-60">
              Today’s passage
            </p>
            {daily ? (
              <PassageBlock daily={daily} />
            ) : (
              <p className="text-sm opacity-60">Loading today’s passage…</p>
            )}
          </section>
          <section className="flex flex-col gap-3 rounded-xl border border-black/10 p-5 dark:border-white/15">
            <p className="text-xs font-medium uppercase tracking-wide opacity-60">
              Journal
            </p>
            <textarea
              className="min-h-32 w-full rounded-lg border border-black/15 bg-transparent p-3 text-sm leading-relaxed outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
              placeholder="Write what needs writing…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <button
                className={primaryButtonCls}
                onClick={saveFreeform}
                disabled={busy || !draft.trim()}
              >
                Save entry
              </button>
              {savedCount > 0 && (
                <span className="text-xs opacity-60">
                  {savedCount} {savedCount === 1 ? "entry" : "entries"} saved
                </span>
              )}
            </div>
          </section>
          <p className="text-xs opacity-50">
            Reading instead? The{" "}
            <a href="/library" className="underline">
              Library
            </a>{" "}
            counts toward your practice too — end the session here when you’re
            done.
          </p>
        </>
      )}
    </div>
  );
}
