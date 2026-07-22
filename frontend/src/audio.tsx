import { useEffect, useRef, useState } from "react";

// One narration playing at a time across the whole app.
let active: HTMLAudioElement | null = null;

// Narration voice preference, per device ("" = server default). Read at play
// time, so a change in Account applies to the very next listen everywhere.
const VOICE_KEY = "stoa:tts-voice";

export const getVoicePref = (): string => localStorage.getItem(VOICE_KEY) ?? "";

export const setVoicePref = (id: string): void => {
  if (id) localStorage.setItem(VOICE_KEY, id);
  else localStorage.removeItem(VOICE_KEY);
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

/** Icon-only listen/stop toggle for a narration URL. Self-contained: owns its
    audio element, silences any other PlayButton when it starts. */
export function PlayButton({
  src,
  title = "Listen",
}: {
  src: string;
  title?: string;
}) {
  const [state, setState] = useState<PlayState>("idle");
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
    return halt;
  }, [src]);

  function toggle() {
    if (state === "playing" || state === "loading") {
      halt();
      setState("idle");
      return;
    }
    const a = new Audio(withVoice(src));
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
  return (
    <button
      type="button"
      className={"play-btn" + (state === "loading" ? " play-loading" : "")}
      onClick={toggle}
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
  );
}
