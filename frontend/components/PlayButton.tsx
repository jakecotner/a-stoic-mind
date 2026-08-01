"use client";

// Passage narration, ported from the first-generation stoa project. A
// self-contained icon-only listen/stop toggle: owns its audio element and
// silences any other PlayButton when it starts.
import { useEffect, useRef, useState } from "react";

// One narration playing at a time across the whole app.
let active: HTMLAudioElement | null = null;

// Narration voice preference, per device ("" = server default). Read at play
// time, so a change in Account applies to the very next listen everywhere.
const VOICE_KEY = "astoicmind:tts-voice";

export const getVoicePref = (): string =>
  typeof window === "undefined" ? "" : (localStorage.getItem(VOICE_KEY) ?? "");

export const setVoicePref = (id: string): void => {
  if (id) localStorage.setItem(VOICE_KEY, id);
  else localStorage.removeItem(VOICE_KEY);
};

// Reading pace, per device (1 = as recorded). A playback-rate setting, not a
// re-synthesis: the same cached audio plays faster or slower, pitch
// preserved by the browser. Chosen at the point of listening — a pace chip
// appears beside the button while narration is active — and the latest
// choice persists for all future narrations.
const PACE_KEY = "astoicmind:tts-pace";
const PACES = [0.75, 1, 1.25, 1.5, 2];

const getPacePref = (): number => {
  if (typeof window === "undefined") return 1;
  const v = Number(localStorage.getItem(PACE_KEY));
  return PACES.includes(v) ? v : 1;
};

const setPacePref = (pace: number): void => {
  if (pace === 1) localStorage.removeItem(PACE_KEY);
  else localStorage.setItem(PACE_KEY, String(pace));
  // Adjust any narration already playing, so the change is audible live.
  if (active) active.playbackRate = pace;
};

/** The narration URL with the chosen voice applied. */
function withVoice(src: string): string {
  const v = getVoicePref();
  if (!v) return src;
  return src + (src.includes("?") ? "&" : "?") + "voice=" + encodeURIComponent(v);
}

type PlayState = "idle" | "loading" | "playing" | "failed";

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

/** Icon-only listen/stop toggle for a narration URL. The first listen to a
    passage synthesizes the audio server-side, so loading can take a while. */
export function PlayButton({
  src,
  title = "Listen",
}: {
  src: string;
  title?: string;
}) {
  const [state, setState] = useState<PlayState>("idle");
  const [pace, setPace] = useState(1);
  const [paceMenu, setPaceMenu] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const halt = () => {
    const a = audioRef.current;
    audioRef.current = null;
    if (a) {
      a.pause();
      a.removeAttribute("src"); // abort any in-flight fetch
      if (active === a) active = null;
    }
  };

  // New passage in the same slot: stop the old narration, reset the button.
  useEffect(() => {
    setState("idle");
    setPaceMenu(false);
    return halt;
  }, [src]);

  // The pace menu closes like any menu: click elsewhere or Escape.
  useEffect(() => {
    if (!paceMenu) return;
    const dismiss = () => setPaceMenu(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("click", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [paceMenu]);

  function toggle() {
    if (state === "playing" || state === "loading") {
      halt();
      setState("idle");
      setPaceMenu(false);
      return;
    }
    const a = new Audio(withVoice(src));
    a.playbackRate = getPacePref();
    setPace(getPacePref());
    active?.pause();
    active = a;
    audioRef.current = a;
    setState("loading");
    a.onplaying = () => {
      if (audioRef.current === a) setState("playing");
    };
    a.onended = () => {
      if (audioRef.current === a) setState("idle");
    };
    // Fires when another PlayButton starts and pauses this one via `active`.
    a.onpause = () => {
      if (audioRef.current === a && !a.ended) setState("idle");
    };
    a.onerror = () => {
      if (audioRef.current === a) setState("failed");
    };
    a.play().catch(() => {
      if (audioRef.current === a) setState("failed");
    });
  }

  const label =
    state === "failed"
      ? "Audio unavailable"
      : state === "playing" || state === "loading"
        ? "Stop narration"
        : title;
  const activeNow = state === "playing" || state === "loading";
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
          className="rounded px-1 text-[11px] normal-case tabular-nums opacity-60 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setPaceMenu((open) => !open);
          }}
          title="Reading pace"
          aria-label={`Reading pace, currently ${pace}x`}
          aria-expanded={paceMenu}
        >
          {pace}x
        </button>
      )}
      {activeNow && paceMenu && (
        <span className="absolute right-0 top-full z-20 mt-1 flex flex-col overflow-hidden rounded-lg border border-black/10 bg-background text-[11px] normal-case shadow-lg dark:border-white/15">
          {PACES.map((v) => (
            <button
              key={v}
              type="button"
              className={`px-3 py-1.5 text-left tabular-nums hover:bg-black/5 dark:hover:bg-white/10 ${
                v === pace ? "font-semibold" : "opacity-70"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setPacePref(v);
                setPace(v);
                setPaceMenu(false);
              }}
            >
              {v}x
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
