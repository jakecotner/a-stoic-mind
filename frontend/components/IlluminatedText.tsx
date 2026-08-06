"use client";

// Read-along illumination: while a text is being narrated, the words
// already read sit at full presence, the current word carries a soft
// glow, and what's still coming waits dimmed — a candle moving across
// the text. When nothing is playing the text rests fully lit.
//
// Word timings come from the narration timing maps (word-start seconds
// per whitespace token, aligned server-side against this exact text).
// The active index is driven by an animation-frame loop polling the
// narration clock — word boundaries are far denser than snapshot events.
import { useEffect, useRef, useState } from "react";
import { getNarrationTime } from "@/lib/narration";

export default function IlluminatedText({
  text,
  active,
  getTimings,
  className,
}: {
  text: string;
  /** True while THIS text is the one being narrated. */
  active: boolean;
  /** Word-start seconds per whitespace token of `text`. Resolving slowly
      (first-listen transcription) or rejecting just means no illumination
      until it settles — the narration itself is unaffected. */
  getTimings: () => Promise<number[]>;
  className?: string;
}) {
  // null = no illumination (idle, or timings not resolved yet): the text
  // rests fully lit. -1 = narration running but the first word hasn't
  // started (everything still "upcoming").
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const startsRef = useRef<number[] | null>(null);

  useEffect(() => {
    if (!active) {
      setActiveIdx(null);
      return;
    }
    let alive = true;
    let frame = 0;
    getTimings()
      .then((starts) => {
        if (alive) startsRef.current = starts;
      })
      .catch(() => {});
    const tick = () => {
      if (!alive) return;
      const starts = startsRef.current;
      if (starts && starts.length) {
        const t = getNarrationTime();
        // Monotonic map: the current word is the last one already begun.
        let i = 0;
        while (i + 1 < starts.length && starts[i + 1] <= t) i++;
        if (t < starts[0]) i = -1;
        setActiveIdx((prev) => (prev === i ? prev : i));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      startsRef.current = null;
      setActiveIdx(null);
    };
  }, [active, getTimings]);

  const lit = active && activeIdx !== null;
  // Tokenize preserving the original whitespace (newlines matter for
  // stanza-shaped passages); word indices count non-space tokens, matching
  // the server's text.split() alignment.
  const parts = text.split(/(\s+)/);
  let word = -1;
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (/^\s*$/.test(part)) return part;
        word++;
        const w = word;
        const cls = !lit
          ? undefined
          : w < (activeIdx as number)
            ? "opacity-90 transition-opacity duration-300 motion-reduce:transition-none"
            : w === activeIdx
              ? "opacity-100 [text-shadow:0_0_14px_currentColor] transition-opacity duration-300 motion-reduce:transition-none"
              : "opacity-40 transition-opacity duration-300 motion-reduce:transition-none";
        return (
          <span key={i} className={cls}>
            {part}
          </span>
        );
      })}
    </span>
  );
}
