"use client";

// The journal page body: today's passage + reflection on the left, the
// journal on the right. Signed-in users can step back through previous
// days — the left panel shows the passage that was assigned that day, the
// right panel that day's entries (via the practice day-detail endpoint).
import { useEffect, useState } from "react";
import BoldMarkdown from "@/components/BoldMarkdown";
import JournalPad, { EntryCard } from "@/components/JournalPad";
import { PlayButton } from "@/components/PlayButton";
import {
  breakdownAudioUrl,
  createNote,
  fetchBreakdown,
  fetchDayDetail,
  passageAudioUrl,
  type Daily,
  type DayDetail,
} from "@/lib/api";
import { configureDictation } from "@/lib/dictation";
import { type ContinueMode, type QueueItem } from "@/lib/narration";
import { useUser } from "@/lib/useUser";

const navButtonCls =
  "rounded border border-black/15 px-2 py-1 text-sm hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent dark:border-white/20 dark:hover:bg-white/10";

/** Local-date ISO (YYYY-MM-DD) — not toISOString(), which shifts to UTC. */
function toIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIso(new Date(y, m - 1, d + days));
}

function labelFor(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** The day's narration queue: the passage, then — when the listener's
    continue mode says so — its reflection. The prepare step generates the
    reflection text if it doesn't exist yet, and skips it if unavailable. */
function dayQueue(passageId: string) {
  return (mode: ContinueMode): QueueItem[] => {
    const items: QueueItem[] = [
      { src: passageAudioUrl(passageId), passageId, kind: "passage" },
    ];
    if (mode === "reflections")
      items.push({
        src: breakdownAudioUrl(passageId),
        passageId,
        kind: "breakdown",
        prepare: () =>
          fetchBreakdown(passageId)
            .then((b) => !!b.breakdown)
            .catch(() => false),
      });
    return items;
  };
}

function PassageArticle({
  heading,
  reference,
  text,
  attribution,
  audioSrc,
  audioQueue,
}: {
  heading: string;
  reference: string;
  text: string;
  attribution: React.ReactNode;
  audioSrc?: string;
  audioQueue?: (mode: ContinueMode) => QueueItem[];
}) {
  return (
    <article>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide opacity-60">
        {heading}
      </p>
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        {reference}
        {audioSrc && (
          <PlayButton
            src={audioSrc}
            title={`Listen to ${reference}`}
            queueFrom={audioQueue}
          />
        )}
      </h1>
      <blockquote className="whitespace-pre-line text-lg leading-relaxed">
        {text}
      </blockquote>
      <p className="mt-4 text-sm opacity-60">{attribution}</p>
    </article>
  );
}

export default function JournalView({ daily }: { daily: Daily | null }) {
  const { user } = useUser();
  // null = today (the server-rendered view); an ISO date = browsing back.
  const [on, setOn] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [detailError, setDetailError] = useState(false);

  const today = toIso(new Date());

  // Spoken notes during narration land as margin notes on the passage
  // being read (they show under it in the library reader).
  useEffect(() => {
    if (!user) return;
    return configureDictation(async (passageId, text) => {
      await createNote(passageId, text);
    });
  }, [user]);

  useEffect(() => {
    if (on === null) {
      setDetail(null);
      setDetailError(false);
      return;
    }
    let stale = false;
    setDetailError(false);
    fetchDayDetail(on)
      .then((d) => {
        if (!stale) setDetail(d);
      })
      .catch(() => {
        if (!stale) setDetailError(true);
      });
    return () => {
      stale = true;
    };
  }, [on]);

  const reloadDetail = () => {
    if (on !== null) fetchDayDetail(on).then(setDetail).catch(() => {});
  };

  const browsing = on !== null;
  const pastPassage = detail?.daily ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      {user && (
        <div className="mb-6 flex items-center gap-3">
          <button
            className={navButtonCls}
            aria-label="Previous day"
            onClick={() => setOn(shiftIso(on ?? today, -1))}
          >
            ←
          </button>
          <span className="text-sm font-medium">
            {browsing ? labelFor(on) : "Today"}
          </span>
          <button
            className={navButtonCls}
            aria-label="Next day"
            disabled={!browsing}
            onClick={() => {
              const next = shiftIso(on!, 1);
              setOn(next >= today ? null : next);
            }}
          >
            →
          </button>
          {browsing && (
            <button className={navButtonCls} onClick={() => setOn(null)}>
              Back to today
            </button>
          )}
        </div>
      )}

      <div className="grid w-full gap-8 lg:grid-cols-2">
        {/* Left: the day's passage; reflection beneath it (today only) */}
        <div className="flex flex-col gap-8">
          {!browsing &&
            (daily ? (
              <PassageArticle
                heading="Today's passage"
                reference={daily.passage.reference}
                text={daily.passage.text}
                audioSrc={passageAudioUrl(daily.passage.id)}
                audioQueue={dayQueue(daily.passage.id)}
                attribution={
                  <>
                    {daily.passage.author}, <em>{daily.passage.work}</em>{" "}
                    &middot; translated by {daily.passage.translator}
                  </>
                }
              />
            ) : (
              <article>
                <h1 className="mb-4 text-2xl font-semibold tracking-tight">
                  A Stoic Mind
                </h1>
                <p className="text-lg opacity-75">
                  A hand-picked passage from the Stoic classics every day, with
                  a grounded reflection — and a journal to write alongside it.
                  Today&apos;s passage is unavailable right now; try again in a
                  moment.
                </p>
              </article>
            ))}

          {!browsing && daily && (
            <section className="border-t border-black/10 pt-6 dark:border-white/15">
              <h2 className="mb-3 flex items-center gap-1 text-sm font-medium uppercase tracking-wide opacity-60">
                Reflection
                {daily.breakdown && (
                  <PlayButton
                    src={breakdownAudioUrl(daily.passage.id)}
                    title="Listen to the reflection"
                  />
                )}
              </h2>
              {daily.breakdown ? (
                <BoldMarkdown text={daily.breakdown} />
              ) : (
                <p className="text-sm opacity-60">
                  Today&apos;s reflection isn&apos;t available right now — the
                  passage stands on its own.
                </p>
              )}
            </section>
          )}

          {browsing &&
            (pastPassage ? (
              <PassageArticle
                heading="That day's passage"
                reference={pastPassage.reference}
                text={pastPassage.text}
                audioSrc={passageAudioUrl(pastPassage.id)}
                audioQueue={dayQueue(pastPassage.id)}
                attribution={
                  <>
                    {pastPassage.author}, <em>{pastPassage.work}</em> &middot;
                    translated by {pastPassage.translator}
                  </>
                }
              />
            ) : (
              <p className="pt-2 text-sm opacity-60">
                {detailError
                  ? "Couldn't load this day — try again in a moment."
                  : "No passage was assigned this day."}
              </p>
            ))}
        </div>

        {/* Right: the journal — working pad today, that day's entries when browsing */}
        <div className="lg:border-l lg:border-black/10 lg:pl-8 dark:lg:border-white/15">
          {browsing ? (
            <div className="flex h-full flex-col gap-4">
              <h2 className="text-lg font-medium">
                Journal — {labelFor(on)}
              </h2>
              {detail && detail.journal.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {detail.journal.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onChanged={reloadDetail}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm opacity-60">
                  {detail ? "No entries this day." : "Loading…"}
                </p>
              )}
            </div>
          ) : (
            <JournalPad passageId={daily?.passage.id ?? null} />
          )}
        </div>
      </div>
    </div>
  );
}
