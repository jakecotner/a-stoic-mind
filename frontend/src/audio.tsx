import { useEffect, useRef, useState } from "react";

// One narration playing at a time across the whole app.
let active: HTMLAudioElement | null = null;

type PlayState = "idle" | "loading" | "playing" | "failed";

/** Listen/stop toggle for a narration URL (passage audio). Self-contained:
    owns its audio element, silences any other PlayButton when it starts. */
export function PlayButton({ src }: { src: string }) {
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
    const a = new Audio(src);
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

  if (state === "failed") {
    return (
      <button className="auth-link play-btn" disabled>
        Audio unavailable
      </button>
    );
  }
  return (
    <button className="auth-link play-btn" onClick={toggle}>
      {state === "idle" && "▶ Listen"}
      {state === "loading" && "Loading…"}
      {state === "playing" && "■ Stop"}
    </button>
  );
}
