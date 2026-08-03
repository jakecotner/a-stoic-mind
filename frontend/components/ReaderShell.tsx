"use client";

// The interactive reading surface. Clicking a passage opens a companion
// panel on the right (a bottom sheet on small screens) with the passage's
// breakdown — generated on the first view anywhere, cached for everyone
// after — plus the reader's own margin notes for that passage.
//
// A client component, but still server-rendered on first load, so the
// passage text stays in the HTML search engines index.
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import BoldMarkdown from "@/components/BoldMarkdown";
import {
  AnnotationsProvider,
  MarginNotes,
  MarkReadButton,
  useAnnotations,
} from "@/components/Reader";
import { PlayButton } from "@/components/PlayButton";
import {
  breakdownAudioUrl,
  createNote,
  fetchBreakdown,
  passageAudioUrl,
  type Passage,
  type Work,
} from "@/lib/api";
import { configureDictation } from "@/lib/dictation";
import {
  type ContinueMode,
  type QueueItem,
  getNarrationSnapshot,
  getServerNarrationSnapshot,
  startNarration,
  stopIfOwner,
  subscribeNarration,
} from "@/lib/narration";

type NavLink = { href: string; label: string } | null;

/** The locator without the work-name prefix: "Meditations 4.3" -> "4.3". */
function locator(reference: string): string {
  return reference.split(" ").pop() ?? reference;
}

function BreakdownPanel({
  passage,
  onClose,
  queueFrom,
}: {
  passage: Passage;
  onClose: () => void;
  queueFrom?: (mode: ContinueMode) => QueueItem[];
}) {
  // Session-local cache: reopening a passage shouldn't refetch.
  const cache = useRef(new Map<string, string | null>());
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "done"; text: string | null } | { kind: "error" }
  >({ kind: "loading" });

  useEffect(() => {
    const cached = cache.current.get(passage.id);
    if (cached !== undefined) {
      setState({ kind: "done", text: cached });
      return;
    }
    let stale = false;
    setState({ kind: "loading" });
    fetchBreakdown(passage.id)
      .then((b) => {
        cache.current.set(passage.id, b.breakdown);
        if (!stale) setState({ kind: "done", text: b.breakdown });
      })
      .catch(() => {
        if (!stale) setState({ kind: "error" });
      });
    return () => {
      stale = true;
    };
  }, [passage.id]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide opacity-60">
          {passage.reference}
        </h2>
        <button
          aria-label="Close panel"
          className="rounded px-2 text-sm opacity-50 hover:opacity-100"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <section>
        <h3 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide opacity-50">
          Breakdown
          {state.kind === "done" && state.text && (
            <PlayButton
              src={breakdownAudioUrl(passage.id)}
              title="Listen to the breakdown"
              queueFrom={queueFrom}
            />
          )}
        </h3>
        {state.kind === "loading" && (
          <p className="text-sm italic opacity-60">
            Preparing the breakdown… the first view of a passage takes a few
            seconds while it&apos;s written.
          </p>
        )}
        {state.kind === "error" && (
          <p className="text-sm opacity-60">
            Couldn&apos;t load the breakdown — try again in a moment.
          </p>
        )}
        {state.kind === "done" &&
          (state.text ? (
            <BoldMarkdown text={state.text} />
          ) : (
            <p className="text-sm opacity-60">
              This passage&apos;s breakdown isn&apos;t available right now —
              the text stands on its own.
            </p>
          ))}
      </section>

      <section className="border-t border-black/10 pt-4 dark:border-white/15">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide opacity-50">
          Your notes
        </h3>
        <MarginNotes passageId={passage.id} />
        <p className="mt-3 text-xs opacity-50">
          Or{" "}
          <Link href="/" className="underline hover:opacity-80">
            write about it in your journal
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

/** Files a spoken note as a margin note on the passage being narrated,
    updating the margin live. Renders nothing; signed out, does nothing. */
function VoiceNotesSink() {
  const ann = useAnnotations();
  const annRef = useRef(ann);
  annRef.current = ann;
  const signedIn = !!ann?.signedIn;
  useEffect(() => {
    if (!signedIn) return;
    return configureDictation(async (passageId, text) => {
      const note = await createNote(passageId, text);
      annRef.current?.addLocal(note);
    });
  }, [signedIn]);
  return null;
}

export default function ReaderShell({
  work,
  label,
  part,
  passages,
  prev,
  next,
}: {
  work: Work;
  label: string | null;
  part: string;
  passages: Passage[];
  prev?: NavLink;
  next?: NavLink;
}) {
  const [selected, setSelected] = useState<Passage | null>(null);

  const close = useCallback(() => setSelected(null), []);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, close]);

  // --- Continuous narration. A listen on any passage builds a queue from
  // there to the end of the part; in "reflections" mode each passage is
  // followed by its breakdown before moving on.

  // One breakdown-readiness promise per passage, so the engine's prefetch
  // and the actual play don't both trigger generation.
  const breakdownReady = useRef(new Map<string, Promise<boolean>>());
  const ensureBreakdown = useCallback((passageId: string) => {
    let p = breakdownReady.current.get(passageId);
    if (!p) {
      p = fetchBreakdown(passageId)
        .then((b) => !!b.breakdown)
        .catch(() => {
          // A failed fetch shouldn't stick — allow a retry on the next run.
          breakdownReady.current.delete(passageId);
          return false;
        });
      breakdownReady.current.set(passageId, p);
    }
    return p;
  }, []);

  const queueFrom = useCallback(
    (start: number, mode: ContinueMode): QueueItem[] => {
      const rest =
        mode === "off" ? passages.slice(start, start + 1) : passages.slice(start);
      const items: QueueItem[] = [];
      for (const p of rest) {
        items.push({
          src: passageAudioUrl(p.id),
          passageId: p.id,
          kind: "passage",
        });
        if (mode === "reflections")
          items.push({
            src: breakdownAudioUrl(p.id),
            passageId: p.id,
            kind: "breakdown",
            prepare: () => ensureBreakdown(p.id),
          });
      }
      return items;
    },
    [passages, ensureBreakdown]
  );

  // A play from the companion panel starts at the breakdown itself, then
  // follows the same plan as any other listen.
  const breakdownQueueFrom = useCallback(
    (p: Passage, mode: ContinueMode): QueueItem[] => {
      const head: QueueItem = {
        src: breakdownAudioUrl(p.id),
        passageId: p.id,
        kind: "breakdown",
        prepare: () => ensureBreakdown(p.id),
      };
      const i = passages.findIndex((x) => x.id === p.id);
      if (mode === "off" || i < 0) return [head];
      return [head, ...queueFrom(i + 1, mode)];
    },
    [passages, queueFrom, ensureBreakdown]
  );

  // Follow along with the narration: highlight the passage being read,
  // scroll it into view when playback rolls to a new one, and show the
  // companion panel while its breakdown is being read.
  const snap = useSyncExternalStore(
    subscribeNarration,
    getNarrationSnapshot,
    getServerNarrationSnapshot
  );
  const narrating =
    (snap.state === "playing" ||
      snap.state === "loading" ||
      snap.state === "paused") &&
    snap.item &&
    passages.some((p) => p.id === snap.item!.passageId)
      ? snap.item
      : null;
  const narratingId = narrating?.passageId ?? null;
  const narratingKind = narrating?.kind ?? null;

  const articleRefs = useRef(new Map<string, HTMLElement>());
  const prevNarrating = useRef<string | null>(null);
  useEffect(() => {
    // Scroll only when playback moves between passages — not on the
    // starting click (the listener is already there).
    if (narratingId && prevNarrating.current && narratingId !== prevNarrating.current)
      articleRefs.current
        .get(narratingId)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    prevNarrating.current = narratingId;
  }, [narratingId]);

  // While this page is narrating, the text doubles as a transport: click
  // any passage to jump the reading there (same continue mode). The click
  // is only a panel toggle when nothing is playing.
  const jumpToken = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (jumpToken.current !== null) stopIfOwner(jumpToken.current);
    },
    []
  );
  const passageClick = useCallback(
    (p: Passage, i: number) => {
      if (narratingId) {
        jumpToken.current = startNarration((mode) => queueFrom(i, mode));
      } else {
        setSelected((cur) => (cur?.id === p.id ? null : p));
      }
    },
    [narratingId, queueFrom]
  );

  const autoOpened = useRef(false);
  useEffect(() => {
    if (!narratingId) {
      autoOpened.current = false;
      return;
    }
    if (narratingKind === "breakdown") {
      const p = passages.find((x) => x.id === narratingId);
      if (p) {
        setSelected(p);
        autoOpened.current = true;
      }
    } else if (autoOpened.current) {
      // Back to the text: close a panel the narration opened (but never
      // one the reader opened themselves).
      setSelected(null);
      autoOpened.current = false;
    }
  }, [narratingId, narratingKind, passages]);

  return (
    <AnnotationsProvider work={work.work}>
      <VoiceNotesSink />
      <div
        className={
          selected
            ? "mx-auto w-full max-w-6xl px-4 py-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-10"
            : "mx-auto w-full max-w-3xl px-4 py-10"
        }
      >
        <div>
          <header className="mb-8">
            <p className="text-sm opacity-60">{work.author}</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {work.work}
              {label && <span className="opacity-60"> · {label}</span>}
            </h1>
            <p className="mt-1 text-sm opacity-60">
              translated by {work.translator}
            </p>
          </header>

          <div className="flex flex-col gap-8">
            {passages.map((p, i) => (
              <article
                key={p.id}
                ref={(el) => {
                  if (el) articleRefs.current.set(p.id, el);
                  else articleRefs.current.delete(p.id);
                }}
              >
                {/* The text is the click target; notes below keep their own
                    controls. Clicking the selected passage again closes. */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={
                    narratingId
                      ? `Jump the narration to ${p.reference}`
                      : `Open companion panel for ${p.reference}`
                  }
                  className={`-mx-2 cursor-pointer rounded-lg px-2 py-1 transition-colors ${
                    selected?.id === p.id || narratingId === p.id
                      ? "bg-black/[.05] dark:bg-white/[.08]"
                      : "hover:bg-black/[.03] dark:hover:bg-white/[.04]"
                  }`}
                  onClick={() => passageClick(p, i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      passageClick(p, i);
                    }
                  }}
                >
                  <p className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide opacity-50">
                    {locator(p.reference)}
                    <PlayButton
                      src={passageAudioUrl(p.id)}
                      title={`Listen to ${p.reference}`}
                      queueFrom={(mode) => queueFrom(i, mode)}
                    />
                  </p>
                  <p className="whitespace-pre-line leading-relaxed">
                    {p.text}
                  </p>
                </div>
                <MarginNotes passageId={p.id} />
              </article>
            ))}
          </div>
          <MarkReadButton
            work={work.work}
            part={part}
            passageIds={passages.map((p) => p.id)}
          />

          {(prev || next) && (
            <nav className="mt-8 flex justify-between border-t border-black/10 pt-6 text-sm dark:border-white/15">
              {prev ? (
                <Link href={prev.href} className="opacity-70 hover:opacity-100">
                  ← {prev.label}
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={next.href} className="opacity-70 hover:opacity-100">
                  {next.label} →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>

        {selected && (
          <aside
            className="fixed inset-x-0 bottom-0 z-10 max-h-[70vh] overflow-y-auto border-t border-black/10 bg-background p-4 shadow-lg lg:sticky lg:top-10 lg:max-h-none lg:overflow-visible lg:border-l lg:border-t-0 lg:bg-transparent lg:p-0 lg:pl-8 lg:shadow-none dark:border-white/15"
            aria-label="Passage companion panel"
          >
            <BreakdownPanel
              passage={selected}
              onClose={close}
              queueFrom={(mode) => breakdownQueueFrom(selected, mode)}
            />
          </aside>
        )}
      </div>
    </AnnotationsProvider>
  );
}
