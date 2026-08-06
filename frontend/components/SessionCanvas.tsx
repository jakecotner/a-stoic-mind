"use client";

// One sitting of practice as a full-attention canvas. The app's chrome
// slips away (a fixed overlay covers nav and header), and the session
// unfolds as moments that fade one into the next: a brief arrival, then
// each of the guide's steps, then a quiet close. Freeform sits get the
// passage and an open page.
//
// Both modes share this surface — a conversation where the input happens
// to be keys or voice:
// - WRITTEN: each prompt arrives as the mentor's words, you write beneath
//   them, your entry joins the dialogue, and the automatic reflection
//   appears inline a beat later (best-effort; out of free turns just means
//   no reflection). Entries are real journal entries, as ever.
// - SPOKEN (Plus): the mentor speaks each step (passage steps roll on
//   through the passage and its reflection), the mic stays open, and
//   thinking aloud becomes a mentor turn on the session's linked
//   conversation — heard back as speech. One follow-up per step, then it
//   hands over. What was said lands in the journal per step.
//
// The passage is illuminated while narrated (IlluminatedText over the
// word-timing maps) — read words at full presence, the current one aglow.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import BoldMarkdown from "@/components/BoldMarkdown";
import IlluminatedText from "@/components/IlluminatedText";
import { PlayButton } from "@/components/PlayButton";
import {
  breakdownAudioUrl,
  createJournalEntry,
  endPracticeSession,
  fetchDaily,
  fetchIntention,
  fetchPassageTimings,
  messageAudioUrl,
  passageAudioUrl,
  PlusRequiredError,
  practiceStepAudioUrl,
  reflectOnEntry,
  startPracticeSession,
  streamPracticeTurn,
  type Daily,
  type Guide,
  type GuideStep,
  type PracticeSession,
} from "@/lib/api";
import {
  getNarrationSnapshot,
  getServerNarrationSnapshot,
  getVoicePref,
  startNarration,
  stopNarration,
  subscribeNarration,
  type QueueItem,
} from "@/lib/narration";
import {
  getDictationSnapshot,
  getServerDictationSnapshot,
  startLiveDictation,
  subscribeDictation,
} from "@/lib/dictation";

const subtleButtonCls =
  "rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";
const primaryButtonCls =
  "rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-85 disabled:opacity-40";

// How long the arrival moment holds before drifting into the first step.
const ARRIVAL_MS = 7000;

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Fade a moment in when its key changes — the session breathing, not a
    page swapping. */
function Moment({
  k,
  children,
  className = "",
}: {
  k: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    const t = setTimeout(() => setShown(true), 40);
    return () => clearTimeout(t);
  }, [k]);
  return (
    <div
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

interface DialogueItem {
  role: "mentor" | "you" | "reflection";
  text: string;
  /** Reflection still being written — renders as a quiet ellipsis. */
  pending?: boolean;
}

// Stages: -1 arrival; 0..steps-1 the guide's steps (freeform: 0 = the open
// page); steps.length the close (guided only — freeform ends from the bar).
type Phase = "intro" | "listening" | "thinking" | "speaking";

export default function SessionCanvas({
  guide,
  mode,
  onDone,
}: {
  guide: Guide | null;
  mode: "written" | "spoken";
  onDone: () => void;
}) {
  const spoken = mode === "spoken" && guide !== null;
  const steps: GuideStep[] = guide?.steps ?? [];

  // The canvas portals to <body> so the takeover escapes the app layout's
  // stacking contexts (the sidebar's floating account button would
  // otherwise paint over it). Portals need the DOM — wait for mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [session, setSession] = useState<PracticeSession | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [intentionLine, setIntentionLine] = useState<string | null>(null);
  const [needsPlus, setNeedsPlus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [stage, setStage] = useState(-1);
  const [dialogue, setDialogue] = useState<DialogueItem[]>([]);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false); // this step's entry is in
  const [savedCount, setSavedCount] = useState(0); // freeform tally
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");

  const startedAtRef = useRef(Date.now());
  const completedRef = useRef<string[]>([]);
  const utterancesRef = useRef<string[]>([]);
  const probedRef = useRef(false);
  const advanceRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const introStartedRef = useRef(-2);
  const liveCleanup = useRef<(() => void) | null>(null);
  const sendRef = useRef<(text: string) => void>(() => {});

  const narration = useSyncExternalStore(
    subscribeNarration,
    getNarrationSnapshot,
    getServerNarrationSnapshot,
  );
  const dictation = useSyncExternalStore(
    subscribeDictation,
    getDictationSnapshot,
    getServerDictationSnapshot,
  );

  const step: GuideStep | null =
    guide && stage >= 0 && stage < steps.length ? steps[stage] : null;
  const closing = guide !== null && stage >= steps.length;
  const freeformOpen = guide === null && stage >= 0;

  // --- Lifecycle: start the session, load the day, open the mic (spoken).
  useEffect(() => {
    startPracticeSession(guide?.key ?? null, spoken)
      .then((s) => {
        setSession(s);
        startedAtRef.current = Date.now();
      })
      .catch((e) => {
        if (e instanceof PlusRequiredError) setNeedsPlus(true);
        else setError("Could not start the session — try again.");
      });
    fetchDaily()
      .then(setDaily)
      .catch(() => {});
    fetchIntention()
      .then((i) => {
        if (i)
          setIntentionLine(
            `${i.minutes_per_day} minutes — this is your practice.`,
          );
      })
      .catch(() => {});
    if (spoken)
      liveCleanup.current = startLiveDictation((text) => sendRef.current(text));
    const tick = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)),
      1000,
    );
    return () => {
      clearInterval(tick);
      liveCleanup.current?.();
      liveCleanup.current = null;
      stopNarration();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, spoken]);

  // Arrival drifts into the first moment on its own; a click skips ahead.
  useEffect(() => {
    if (stage !== -1) return;
    const t = setTimeout(() => setStage(0), ARRIVAL_MS);
    return () => clearTimeout(t);
  }, [stage]);

  // --- Illumination plumbing.
  const timingsCache = useRef(new Map<string, Promise<number[]>>());
  const passageTimings = useCallback(() => {
    const id = daily?.passage.id;
    if (!id) return Promise.reject(new Error("no passage"));
    const key = `${id}:${getVoicePref()}`;
    let p = timingsCache.current.get(key);
    if (!p) {
      p = fetchPassageTimings(id, getVoicePref()).catch((err) => {
        timingsCache.current.delete(key);
        throw err;
      });
      timingsCache.current.set(key, p);
    }
    return p;
  }, [daily]);
  const passageNarrating =
    daily != null &&
    narration.item?.src === passageAudioUrl(daily.passage.id) &&
    narration.state !== "idle" &&
    narration.state !== "failed";

  const passageQueue = useCallback((): QueueItem[] => {
    if (!daily) return [];
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
  }, [daily]);

  // --- Advancing.
  const resetMoment = () => {
    setDialogue([]);
    setDraft("");
    setSaved(false);
    utterancesRef.current = [];
    probedRef.current = false;
    advanceRef.current = false;
  };

  const advance = (markKey?: string) => {
    if (markKey && !completedRef.current.includes(markKey))
      completedRef.current.push(markKey);
    // Spoken: what was said on this step becomes its journal entry.
    if (spoken && step) {
      const said = utterancesRef.current.join("\n\n").trim();
      if (said)
        void createJournalEntry(
          `${step.title}\n\n${said}`,
          daily?.passage.id ?? null,
        ).catch(() => {});
    }
    resetMoment();
    setPhase("intro");
    setStage((s) => s + 1);
  };

  // --- Spoken machinery (ported from the first spoken flow).
  useEffect(() => {
    if (!spoken || !session || !step) return;
    if (step.kind === "passage" && !daily) return;
    if (introStartedRef.current === stage) return;
    introStartedRef.current = stage;
    setPhase("intro");
    const items: QueueItem[] = [
      {
        src: practiceStepAudioUrl(guide!.key, step.key),
        passageId: step.key,
        kind: "reply",
      },
      ...(step.kind === "passage" ? passageQueue() : []),
    ];
    startNarration(() => items);
  }, [spoken, session, daily, stage, step, guide, passageQueue]);

  useEffect(() => {
    if (!spoken || !step) return;
    const ns = getNarrationSnapshot().state;
    const ds = getDictationSnapshot().status;
    if (ds === "recording" || ds === "transcribing") return;
    if (ns !== "idle" && ns !== "failed") return;
    if (phase === "intro" && introStartedRef.current === stage) {
      // A passage step asks nothing back — heard through, it rolls on. If
      // its audio failed, stay: the passage is on screen to read.
      if (step.kind === "passage" && ns === "idle") advance(step.key);
      else {
        setPhase("listening");
        // Words spoken during the arrival waited here for their step.
        const held = pendingRef.current;
        pendingRef.current = null;
        if (held) sendRef.current(held);
      }
    } else if (phase === "speaking") {
      if (advanceRef.current) advance(step.key);
      else setPhase("listening");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narration.state, dictation.status, phase, stage, spoken]);

  const sendTurn = async (text: string) => {
    if (!session || !step) return;
    utterancesRef.current.push(text);
    setError(null);
    setPhase("thinking");
    setDialogue((prev) => [
      ...prev,
      { role: "you", text },
      { role: "mentor", text: "" },
    ]);
    let reply = "";
    const probed = probedRef.current;
    const last = stage >= steps.length - 1;
    await streamPracticeTurn(
      session.id,
      { step: step.key, text, probed },
      {
        onDelta: (t) => {
          reply += t;
          setDialogue((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              text: next[next.length - 1].text + t,
            };
            return next;
          });
        },
        onError: (msg) => setError(msg),
        onDone: ({ message_id }) => {
          const pending = pendingRef.current;
          pendingRef.current = null;
          if (pending) {
            // More was said while the mentor was thinking — the reply on
            // screen didn't hear it, so skip the narration and keep going.
            void sendTurn(pending);
            return;
          }
          if (!probed && !last && /\?\s*$/.test(reply.trim()))
            probedRef.current = true;
          else advanceRef.current = true;
          if (message_id) {
            setPhase("speaking");
            startNarration(() => [
              {
                src: messageAudioUrl(message_id),
                passageId: message_id,
                kind: "reply",
              },
            ]);
          } else {
            advanceRef.current = false;
            setPhase("listening");
          }
        },
      },
    );
  };

  sendRef.current = (text: string) => {
    if (!session) return;
    if (stage === -1) {
      // Speaking during the arrival skips ahead; the words wait for the
      // first step's intro to hand them over.
      pendingRef.current = pendingRef.current
        ? `${pendingRef.current} ${text}`
        : text;
      setStage(0);
      return;
    }
    if (!step) return;
    if (phase === "thinking") {
      pendingRef.current = pendingRef.current
        ? `${pendingRef.current} ${text}`
        : text;
      return;
    }
    advanceRef.current = false;
    void sendTurn(text);
  };

  // --- Written machinery: the entry and its inline reflection.
  const saveEntry = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    const title = step ? step.title : null;
    try {
      const entry = await createJournalEntry(
        title ? `${title}\n\n${text}` : text,
        daily?.passage.id ?? null,
      );
      setDraft("");
      setSaved(true);
      setSavedCount((n) => n + 1);
      if (guide === null && !completedRef.current.includes("journal"))
        completedRef.current.push("journal");
      const placeholder: DialogueItem = {
        role: "reflection",
        text: "",
        pending: true,
      };
      setDialogue((prev) => [...prev, { role: "you", text }, placeholder]);
      // The reflection arrives in its own time; losing it (cap, outage)
      // just removes the placeholder — the entry itself is safe.
      void reflectOnEntry(entry.id)
        .then((withReflection) => {
          setDialogue((prev) =>
            withReflection.reflection
              ? prev.map((d) =>
                  d === placeholder
                    ? { role: "reflection" as const, text: withReflection.reflection! }
                    : d,
                )
              : prev.filter((d) => d !== placeholder),
          );
        })
        .catch(() => {
          setDialogue((prev) => prev.filter((d) => d !== placeholder));
        });
    } catch {
      setError("Could not save that entry — your words are kept, try again.");
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    setBusy(true);
    liveCleanup.current?.();
    liveCleanup.current = null;
    stopNarration();
    if (spoken && step) {
      const said = utterancesRef.current.join("\n\n").trim();
      if (said) {
        try {
          await createJournalEntry(
            `${step.title}\n\n${said}`,
            daily?.passage.id ?? null,
          );
        } catch {
          /* the words live on in the conversation transcript */
        }
      }
    }
    try {
      if (session) await endPracticeSession(session.id, completedRef.current);
      onDone();
    } catch {
      setError("Could not end the session — try again.");
      setBusy(false);
    }
  };

  // --- Early exits.
  const overlay = (node: React.ReactNode) =>
    mounted ? createPortal(node, document.body) : null;

  if (needsPlus) {
    return overlay(
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-start justify-center gap-4 px-6 py-16">
          <p className="text-sm opacity-80">
            Spoken sessions are a Plus feature — the mentor guides the sitting
            by voice and responds to your thinking out loud.{" "}
            <Link href="/account" className="underline">
              Upgrade to Plus
            </Link>{" "}
            to begin one.
          </p>
          <button className={subtleButtonCls} onClick={onDone}>
            ← Back to practice
          </button>
        </div>
      </div>
    );
  }
  if (error && !session) {
    return overlay(
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-start justify-center gap-4 px-6 py-16">
          <p className="text-sm opacity-80">{error}</p>
          <button className={subtleButtonCls} onClick={onDone}>
            ← Back to practice
          </button>
        </div>
      </div>,
    );
  }

  const title = guide ? guide.title : "Practice";
  const chip = !spoken
    ? null
    : dictation.status === "recording"
      ? "● hearing you"
      : dictation.status === "transcribing"
        ? "understanding…"
        : phase === "thinking"
          ? "the mentor is thinking…"
          : phase === "intro" || phase === "speaking"
            ? narration.state === "loading"
              ? "preparing…"
              : "mentor speaking — talk anytime"
            : dictation.status === "denied"
              ? "mic blocked in the browser"
              : "listening — think aloud, pause when you're done";

  const momentKey =
    stage === -1 ? "arrival" : closing ? "closing" : `stage-${stage}`;

  return overlay(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      {/* The quiet bar: what this is, where you are, the time, the exit. */}
      <div className="pointer-events-none sticky top-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-background via-background/90 to-transparent px-6 py-4">
        <span className="text-sm font-medium opacity-70">
          {title}
          {spoken && (
            <span className="ml-2 text-xs uppercase tracking-wide opacity-60">
              spoken
            </span>
          )}
        </span>
        <span className="pointer-events-auto flex items-center gap-3">
          {guide && (
            <span className="flex items-center gap-1.5" aria-hidden>
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
                    i < stage || closing
                      ? "bg-foreground/70"
                      : i === stage
                        ? "bg-foreground"
                        : "bg-foreground/20"
                  }`}
                />
              ))}
            </span>
          )}
          <span className="text-sm tabular-nums opacity-60">
            {formatElapsed(elapsed)}
          </span>
          <button className={subtleButtonCls} onClick={end} disabled={busy}>
            End session
          </button>
        </span>
      </div>

      <div className="mx-auto w-full max-w-2xl px-6 pb-24">
        {chip && stage !== -1 && !closing && (
          <p className="mb-8 flex items-center gap-2 text-sm opacity-70">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                dictation.status === "recording"
                  ? "animate-pulse bg-red-500"
                  : dictation.status === "denied"
                    ? "bg-black/30 dark:bg-white/30"
                    : "bg-green-500"
              }`}
            />
            {chip}
          </p>
        )}
        {error && session && (
          <p className="mb-6 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {/* Arrival */}
        {stage === -1 && (
          <Moment k={momentKey}>
            <button
              className="flex min-h-[70vh] w-full cursor-default flex-col items-center justify-center gap-6 text-center"
              onClick={() => setStage(0)}
              aria-label="Begin"
            >
              <span
                className="h-2.5 w-2.5 rounded-full bg-foreground/60 motion-safe:animate-[pulse_4s_ease-in-out_infinite]"
                aria-hidden
              />
              <span className="text-2xl font-semibold tracking-tight">
                {title}
              </span>
              {guide && (
                <span className="text-sm opacity-60">{guide.tagline}</span>
              )}
              {intentionLine && (
                <span className="text-sm opacity-60">{intentionLine}</span>
              )}
              <span className="mt-6 text-xs uppercase tracking-widest opacity-40">
                take a breath
              </span>
            </button>
          </Moment>
        )}

        {/* A guided step */}
        {step && (
          <Moment k={momentKey} className="pt-[12vh]">
            <p className="mb-6 text-xs font-medium uppercase tracking-widest opacity-50">
              {step.title}
            </p>

            {step.kind === "passage" ? (
              <>
                <p className="mb-6 text-sm opacity-60">{step.body}</p>
                {daily ? (
                  <div>
                    <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                      {daily.passage.reference}
                      <PlayButton
                        src={passageAudioUrl(daily.passage.id)}
                        title={`Listen to ${daily.passage.reference}`}
                        queueFrom={passageQueue}
                      />
                    </p>
                    <blockquote className="whitespace-pre-line text-lg leading-relaxed">
                      <IlluminatedText
                        text={daily.passage.text}
                        active={passageNarrating}
                        getTimings={passageTimings}
                      />
                    </blockquote>
                    {daily.breakdown && (
                      <div className="mt-8 border-l-2 border-black/15 pl-4 dark:border-white/25">
                        <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-widest opacity-50">
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
                ) : (
                  <p className="text-sm opacity-60">
                    Loading today’s passage…
                  </p>
                )}
                {!spoken && (
                  <div className="mt-10 flex items-center gap-4">
                    <button
                      className={primaryButtonCls}
                      onClick={() => advance(step.key)}
                    >
                      Continue →
                    </button>
                    <button
                      className="text-xs opacity-50 hover:opacity-80"
                      onClick={() => advance()}
                    >
                      skip
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* The prompt is the mentor addressing you. */}
                <div className="max-w-[90%] rounded-xl bg-black/5 px-4 py-3 text-[15px] leading-relaxed dark:bg-white/10">
                  {step.body}
                </div>

                <Dialogue items={dialogue} phase={phase} />

                {!spoken && !saved && (
                  <div className="mt-6 flex flex-col gap-3">
                    <textarea
                      className="min-h-28 w-full resize-none rounded-xl border border-black/15 bg-transparent p-4 text-[15px] leading-relaxed outline-none transition-colors focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
                      placeholder="Write what's true…"
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        const el = e.target;
                        el.style.height = "auto";
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                    />
                    <div className="flex items-center gap-4">
                      <button
                        className={primaryButtonCls}
                        onClick={saveEntry}
                        disabled={busy || !draft.trim()}
                      >
                        Save
                      </button>
                      <button
                        className="text-xs opacity-50 hover:opacity-80"
                        onClick={() => advance()}
                      >
                        skip →
                      </button>
                    </div>
                  </div>
                )}
                {!spoken && saved && (
                  <div className="mt-8">
                    <button
                      className={primaryButtonCls}
                      onClick={() => advance(step.key)}
                    >
                      Continue →
                    </button>
                  </div>
                )}
              </>
            )}
            {spoken && (
              <div className="mt-10">
                <button
                  className="text-xs opacity-50 hover:opacity-80"
                  onClick={() => {
                    stopNarration();
                    advance(step.key);
                  }}
                >
                  next step →
                </button>
              </div>
            )}
          </Moment>
        )}

        {/* Freeform: the passage above an open page */}
        {freeformOpen && (
          <Moment k={momentKey} className="pt-[8vh]">
            {daily ? (
              <div className="mb-10">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                  {daily.passage.reference}
                  <PlayButton
                    src={passageAudioUrl(daily.passage.id)}
                    title={`Listen to ${daily.passage.reference}`}
                    queueFrom={passageQueue}
                  />
                </p>
                <blockquote className="whitespace-pre-line text-lg leading-relaxed">
                  <IlluminatedText
                    text={daily.passage.text}
                    active={passageNarrating}
                    getTimings={passageTimings}
                  />
                </blockquote>
                {daily.breakdown && (
                  <div className="mt-8 border-l-2 border-black/15 pl-4 dark:border-white/25">
                    <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-widest opacity-50">
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
            ) : (
              <p className="mb-10 text-sm opacity-60">
                Loading today’s passage…
              </p>
            )}

            <Dialogue items={dialogue} phase={phase} />

            <div className="mt-6 flex flex-col gap-3">
              <textarea
                className="min-h-28 w-full resize-none rounded-xl border border-black/15 bg-transparent p-4 text-[15px] leading-relaxed outline-none transition-colors focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
                placeholder="Write what needs writing…"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }}
              />
              <div className="flex items-center gap-4">
                <button
                  className={primaryButtonCls}
                  onClick={saveEntry}
                  disabled={busy || !draft.trim()}
                >
                  Save entry
                </button>
                {savedCount > 0 && (
                  <span className="text-xs opacity-50">
                    {savedCount} {savedCount === 1 ? "entry" : "entries"} saved
                  </span>
                )}
              </div>
            </div>
            <p className="mt-8 text-xs opacity-40">
              Reading instead? The Library counts toward your practice too —
              end the session here when you’re done.
            </p>
          </Moment>
        )}

        {/* Close */}
        {closing && (
          <Moment k={momentKey}>
            <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
              <span
                className="h-2.5 w-2.5 rounded-full bg-foreground/60"
                aria-hidden
              />
              <p className="max-w-md text-[15px] leading-relaxed opacity-80">
                That’s the whole {title.toLowerCase()} —{" "}
                {completedRef.current.length} of {steps.length} steps in{" "}
                {formatElapsed(elapsed)}. Stay as long as you like.
              </p>
              <button className={primaryButtonCls} onClick={end} disabled={busy}>
                End session
              </button>
            </div>
          </Moment>
        )}
      </div>
    </div>
  );
}

/** The exchange so far on this moment — your words, the mentor's, the
    inline reflection finding its way in. */
function Dialogue({ items, phase }: { items: DialogueItem[]; phase: Phase }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-6 flex flex-col gap-3">
      {items.map((d, i) => (
        <div
          key={i}
          className={`whitespace-pre-wrap rounded-xl px-4 py-3 text-[15px] leading-relaxed ${
            d.role === "you"
              ? "ml-auto max-w-[85%] bg-foreground text-background"
              : "max-w-[90%] bg-black/5 dark:bg-white/10"
          }`}
        >
          {d.pending ? (
            <span className="opacity-50 motion-safe:animate-pulse">…</span>
          ) : d.role === "reflection" ? (
            <BoldMarkdown text={d.text} />
          ) : (
            d.text ||
            (phase === "thinking" && i === items.length - 1 ? "…" : "")
          )}
        </div>
      ))}
    </div>
  );
}
