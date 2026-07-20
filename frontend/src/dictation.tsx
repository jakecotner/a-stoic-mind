import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings for the Web Speech recognition API — lib.dom has none, and
// Chrome/Safari still expose it under the webkit prefix.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

const SR: (new () => SpeechRecognitionLike) | undefined =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export interface Dictation {
  supported: boolean;
  listening: boolean;
  /** Words heard so far in the current utterance, not yet final. */
  interim: string;
  toggle(): void;
  stop(): void;
}

/** Dictation via the browser's speech recognition (free, on-device/Google —
    no backend involved). Final transcript chunks arrive through onFinal;
    interim text is exposed so composers can ghost it under the textarea. */
export function useDictation(onFinal: (text: string) => void): Dictation {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Whether the user still means to be listening — Chrome ends recognition on
  // its own after a stretch of silence, and we restart it quietly.
  const wantRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  const toggle = useCallback(() => {
    if (wantRef.current) {
      stop();
      return;
    }
    if (!SR) return;
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinalRef.current(r[0].transcript.trim());
        else pending += r[0].transcript;
      }
      setInterim(pending.trim());
    };
    rec.onend = () => {
      if (wantRef.current && recRef.current === rec) {
        try {
          rec.start();
        } catch {
          stop();
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") stop();
    };
    wantRef.current = true;
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { supported: Boolean(SR), listening, interim, toggle, stop };
}

/** Mic toggle for a composer. Renders nothing where the API is unsupported. */
export function MicButton({ dictation }: { dictation: Dictation }) {
  if (!dictation.supported) return null;
  return (
    <button
      type="button"
      className={"mic-btn" + (dictation.listening ? " mic-live" : "")}
      onClick={dictation.toggle}
      title={dictation.listening ? "Stop dictation" : "Speak instead of typing"}
      aria-label={dictation.listening ? "Stop dictation" : "Speak instead of typing"}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    </button>
  );
}
