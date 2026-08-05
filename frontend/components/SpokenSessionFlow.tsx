"use client";

// A spoken sitting (Plus): the mentor runs the guide as a live voice
// conversation. Each step opens in the mentor's voice — the step's prompt,
// and on passage steps the passage and its reflection straight after — then
// the mic stays open (dictation engine's live mode) and thinking aloud
// becomes a turn on the session's linked conversation, heard back as speech.
// The mentor may ask one follow-up per step, then hands over to the next.
// What was said on a step lands in the journal, same as the written flow.
//
// The loop mirrors the chat page's live mode; the extra layer here is the
// step machine: intro narration -> listening -> thinking -> speaking, with
// the advance decision made from the mentor's reply (a trailing question
// keeps the step open for one more exchange).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PassageBlock } from "@/components/PracticeSessionFlow";
import {
  breakdownAudioUrl,
  createJournalEntry,
  endPracticeSession,
  fetchDaily,
  messageAudioUrl,
  passageAudioUrl,
  PlusRequiredError,
  practiceStepAudioUrl,
  startPracticeSession,
  streamPracticeTurn,
  type Daily,
  type Guide,
  type PracticeSession,
} from "@/lib/api";
import {
  getNarrationSnapshot,
  getServerNarrationSnapshot,
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
  "rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-85 disabled:opacity-40";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Exchange {
  role: "user" | "assistant";
  content: string;
}

type Phase = "intro" | "listening" | "thinking" | "speaking";

export default function SpokenSessionFlow({
  guide,
  onDone,
}: {
  guide: Guide;
  onDone: () => void;
}) {
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [needsPlus, setNeedsPlus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("intro");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const startedAtRef = useRef(Date.now());
  const completedRef = useRef<string[]>([]);
  // What was said aloud on the current step — becomes its journal entry.
  const utterancesRef = useRef<string[]>([]);
  // The mentor has used its one follow-up on this step.
  const probedRef = useRef(false);
  // Advance once the reply now being spoken finishes playing.
  const advanceRef = useRef(false);
  // An utterance that arrived while a reply was still streaming.
  const pendingRef = useRef<string | null>(null);
  // Which step's intro narration has been started (guards re-fires).
  const introStartedRef = useRef(-1);
  const liveCleanup = useRef<(() => void) | null>(null);
  // The utterance handler is registered once with the dictation engine but
  // must see current state — routed through a ref updated every render.
  const sendRef = useRef<(text: string) => void>(() => {});
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const steps = guide.steps;
  const step = stepIdx < steps.length ? steps[stepIdx] : null;
  const finished = stepIdx >= steps.length;

  useEffect(() => {
    startPracticeSession(guide.key, true)
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
    // The launcher click primed the audio element; the mic prompt (if any)
    // appears now, and the mic stays open for the whole sitting.
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
  }, [guide]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [exchanges]);

  // Open each step in the mentor's voice. Passage steps wait for the daily
  // passage to load, then roll on through it and its reflection.
  useEffect(() => {
    if (!session || !step) return;
    if (step.kind === "passage" && !daily) return;
    if (introStartedRef.current === stepIdx) return;
    introStartedRef.current = stepIdx;
    setPhase("intro");
    const items: QueueItem[] = [
      {
        src: practiceStepAudioUrl(guide.key, step.key),
        passageId: step.key,
        kind: "reply",
      },
    ];
    if (step.kind === "passage" && daily) {
      items.push({
        src: passageAudioUrl(daily.passage.id),
        passageId: daily.passage.id,
        kind: "passage",
      });
      if (daily.breakdown)
        items.push({
          src: breakdownAudioUrl(daily.passage.id),
          passageId: daily.passage.id,
          kind: "breakdown",
        });
    }
    startNarration(() => items);
  }, [session, daily, stepIdx, step, guide]);

  const advanceStep = () => {
    const s = steps[stepIdx];
    if (!s) return;
    if (!completedRef.current.includes(s.key)) completedRef.current.push(s.key);
    const spoken = utterancesRef.current.join("\n\n").trim();
    utterancesRef.current = [];
    probedRef.current = false;
    advanceRef.current = false;
    if (spoken)
      void createJournalEntry(
        `${s.title}\n\n${spoken}`,
        daily?.passage.id ?? null,
      ).catch(() => {});
    setPhase("intro");
    setStepIdx((i) => i + 1);
  };

  // The step machine's clock: when narration falls quiet (and the mic isn't
  // mid-take, which would mean a barge-in is about to arrive as an
  // utterance), move the phase along. Snapshots are read fresh — the render
  // -captured ones can be a beat stale right after startNarration().
  useEffect(() => {
    const ns = getNarrationSnapshot().state;
    const ds = getDictationSnapshot().status;
    if (ds === "recording" || ds === "transcribing") return;
    if (ns !== "idle" && ns !== "failed") return;
    if (phase === "intro" && introStartedRef.current === stepIdx) {
      // A passage step asks nothing back — heard through, it rolls on. If
      // its audio failed, stay: the passage is on screen to read.
      if (step?.kind === "passage" && ns === "idle") advanceStep();
      else setPhase("listening");
    } else if (phase === "speaking") {
      if (advanceRef.current) advanceStep();
      else setPhase("listening");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narration.state, dictation.status, phase, stepIdx]);

  const sendTurn = async (text: string) => {
    if (!session || !step) return;
    utterancesRef.current.push(text);
    setError(null);
    setPhase("thinking");
    setExchanges((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    let reply = "";
    const probed = probedRef.current;
    const stepKey = step.key;
    const last = stepIdx >= steps.length - 1;
    await streamPracticeTurn(
      session.id,
      { step: stepKey, text, probed },
      {
        onDelta: (t) => {
          reply += t;
          setExchanges((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              content: next[next.length - 1].content + t,
            };
            return next;
          });
        },
        onError: (msg) => setError(msg),
        onDone: ({ message_id }) => {
          // More was said while the mentor was thinking: skip straight into
          // the next turn — the reply on screen didn't hear those words, so
          // it isn't spoken and the step stays open.
          const pending = pendingRef.current;
          pendingRef.current = null;
          if (pending) {
            void sendTurn(pending);
            return;
          }
          // A trailing question is the mentor's one follow-up: hold the
          // step for the answer. Anything else means move along once heard.
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

  // What a finished utterance does — kept current across renders.
  sendRef.current = (text: string) => {
    if (!session || finished) return;
    if (phase === "thinking") {
      pendingRef.current = pendingRef.current
        ? `${pendingRef.current} ${text}`
        : text;
      return;
    }
    // Talking over the mentor (intro or reply) means "listen to me now" —
    // the dictation engine already stopped the narration.
    advanceRef.current = false;
    void sendTurn(text);
  };

  const end = async () => {
    setBusy(true);
    liveCleanup.current?.();
    liveCleanup.current = null;
    stopNarration();
    const s = steps[stepIdx];
    const spoken = utterancesRef.current.join("\n\n").trim();
    if (spoken && s) {
      try {
        await createJournalEntry(
          `${s.title}\n\n${spoken}`,
          daily?.passage.id ?? null,
        );
      } catch {
        /* the words live on in the conversation transcript */
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

  if (needsPlus) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <p className="mb-4 text-sm opacity-80">
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
    );
  }

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

  const chip =
    dictation.status === "recording"
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {guide.title}
          <span className="ml-2 align-middle text-xs font-normal uppercase tracking-wide opacity-50">
            spoken
          </span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-black/15 px-3 py-1 text-sm tabular-nums dark:border-white/20">
            {formatElapsed(elapsed)}
          </span>
          <button className={subtleButtonCls} onClick={end} disabled={busy}>
            End session
          </button>
        </div>
      </div>

      {!finished && (
        <p className="-mt-3 flex items-center gap-2 text-sm opacity-70">
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
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {step && (
        <section className="flex flex-col gap-4 rounded-xl border border-black/10 p-5 dark:border-white/15">
          <p className="text-xs font-medium uppercase tracking-wide opacity-60">
            Step {stepIdx + 1} of {steps.length} — {step.title}
          </p>
          <p className="text-sm opacity-70">{step.body}</p>
          {step.kind === "passage" &&
            (daily ? (
              <PassageBlock daily={daily} />
            ) : (
              <p className="text-sm opacity-60">Loading today’s passage…</p>
            ))}
          <div>
            <button
              className={subtleButtonCls}
              onClick={() => {
                stopNarration();
                advanceStep();
              }}
            >
              Next step →
            </button>
          </div>
        </section>
      )}

      {finished && (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-black/10 p-5 dark:border-white/15">
          <p className="text-sm">
            That’s the whole {guide.title.toLowerCase()} —{" "}
            {completedRef.current.length} of {steps.length} steps done in{" "}
            {formatElapsed(elapsed)}. Stay as long as you like.
          </p>
          <button className={primaryButtonCls} onClick={end} disabled={busy}>
            End session
          </button>
        </section>
      )}

      {exchanges.length > 0 && (
        <div className="flex flex-col gap-3">
          {exchanges.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-foreground text-background"
                  : "bg-black/5 dark:bg-white/10"
              }`}
            >
              {m.content ||
                (phase === "thinking" && i === exchanges.length - 1 ? "…" : "")}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
