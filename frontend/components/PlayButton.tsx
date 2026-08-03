"use client";

// Passage narration, ported from the first-generation stoa project. An
// icon-only listen/stop toggle over the shared narration engine
// (lib/narration.ts): one narration plays at a time app-wide, and a play
// can roll on past its own passage when the parent supplies a queue.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  type ContinueMode,
  type QueueItem,
  getContinuePref,
  getNarrationSnapshot,
  getPacePref,
  getServerNarrationSnapshot,
  PACES,
  setContinuePref,
  setPacePref,
  startNarration,
  stopIfOwner,
  stopNarration,
  subscribeNarration,
} from "@/lib/narration";

const CONTINUE_CHIP: Record<ContinueMode, string> = {
  off: "auto: off",
  passages: "auto: on",
  reflections: "auto: on+",
};

const CONTINUE_LABELS: Record<ContinueMode, string> = {
  off: "Stop after this passage",
  passages: "Continue to the next passage",
  reflections: "Continue, reading reflections too",
};

function SpeakerIcon({ muted }: { muted?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        <>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

const chipCls =
  "rounded px-1 text-[11px] normal-case tabular-nums opacity-60 hover:opacity-100";
const menuCls =
  "absolute right-0 top-full z-20 mt-1 flex flex-col overflow-hidden rounded-lg border border-black/10 bg-background text-[11px] normal-case shadow-lg dark:border-white/15";
const menuItemCls = (current: boolean) =>
  `px-3 py-1.5 text-left tabular-nums hover:bg-black/5 dark:hover:bg-white/10 ${
    current ? "font-semibold" : "opacity-70"
  }`;

/** Icon-only listen/stop toggle for a narration URL. The first listen to a
    passage synthesizes the audio server-side, so loading can take a while.

    With `queueFrom`, a listen becomes the start of a continuous run: the
    parent builds the queue from here for the chosen continue mode, and a
    chip beside the pace chip lets the listener change that mode live. */
export function PlayButton({
  src,
  title = "Listen",
  queueFrom,
}: {
  src: string;
  title?: string;
  queueFrom?: (mode: ContinueMode) => QueueItem[];
}) {
  const snap = useSyncExternalStore(
    subscribeNarration,
    getNarrationSnapshot,
    getServerNarrationSnapshot
  );
  // This button renders whatever item the engine is on, matched by URL —
  // so when a run rolls to the next passage, the old button falls idle and
  // the new one lights up, whichever button started the run.
  const mine = snap.item?.src === src;
  const state = mine ? snap.state : "idle";
  const activeNow = state === "playing" || state === "loading";

  const [pace, setPace] = useState(1);
  const [mode, setMode] = useState<ContinueMode>("off");
  const [menu, setMenu] = useState<"pace" | "continue" | null>(null);
  const ownerRef = useRef<number | null>(null);

  // Chips reflect the device prefs whenever this button becomes the live
  // one — playback may have arrived here from another button's click.
  useEffect(() => {
    if (activeNow) {
      setPace(getPacePref());
      setMode(getContinuePref());
    } else {
      setMenu(null);
    }
  }, [activeNow]);

  // New passage in the same slot, or unmount: a run this button started
  // shouldn't keep narrating a page that's gone.
  useEffect(() => {
    setMenu(null);
    return () => {
      if (ownerRef.current !== null) stopIfOwner(ownerRef.current);
    };
  }, [src]);

  // Menus close like any menu: click elsewhere or Escape.
  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("click", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function toggle() {
    if (activeNow) {
      stopNarration();
      setMenu(null);
      return;
    }
    const build =
      queueFrom ??
      (() => [{ src, passageId: "", kind: "passage" as const }]);
    ownerRef.current = startNarration(build);
  }

  const label =
    state === "failed"
      ? "Audio unavailable"
      : activeNow
        ? "Stop narration"
        : title;
  // All spans, no divs: PlayButton lives inside <p>/<h1> heading rows, where
  // only phrasing content is valid.
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className={`rounded p-1 opacity-50 transition-opacity hover:opacity-100 disabled:opacity-30 ${
          state === "loading" ? "animate-pulse opacity-100" : ""
        }`}
        onClick={(e) => {
          // Passages are themselves click targets (they open the companion
          // panel); a listen click shouldn't also toggle the panel.
          e.stopPropagation();
          toggle();
        }}
        disabled={state === "failed"}
        title={label}
        aria-label={label}
      >
        {state === "failed" ? (
          <SpeakerIcon muted />
        ) : state === "idle" ? (
          <SpeakerIcon />
        ) : (
          <StopIcon />
        )}
      </button>
      {activeNow && (
        <button
          type="button"
          className={chipCls}
          onClick={(e) => {
            e.stopPropagation();
            setMenu((open) => (open === "pace" ? null : "pace"));
          }}
          title="Reading pace"
          aria-label={`Reading pace, currently ${pace}x`}
          aria-expanded={menu === "pace"}
        >
          {pace}x
        </button>
      )}
      {activeNow && queueFrom && (
        <button
          type="button"
          className={chipCls}
          onClick={(e) => {
            e.stopPropagation();
            setMenu((open) => (open === "continue" ? null : "continue"));
          }}
          title="Continue narration"
          aria-label={`Continue narration: ${CONTINUE_LABELS[mode]}`}
          aria-expanded={menu === "continue"}
        >
          {CONTINUE_CHIP[mode]}
        </button>
      )}
      {activeNow && menu === "pace" && (
        <span className={menuCls}>
          {PACES.map((v) => (
            <button
              key={v}
              type="button"
              className={menuItemCls(v === pace)}
              onClick={(e) => {
                e.stopPropagation();
                setPacePref(v);
                setPace(v);
                setMenu(null);
              }}
            >
              {v}x
            </button>
          ))}
        </span>
      )}
      {activeNow && menu === "continue" && (
        <span className={menuCls}>
          {(Object.keys(CONTINUE_LABELS) as ContinueMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={menuItemCls(m === mode)}
              onClick={(e) => {
                e.stopPropagation();
                setContinuePref(m);
                setMode(m);
                setMenu(null);
              }}
            >
              {CONTINUE_LABELS[m]}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
