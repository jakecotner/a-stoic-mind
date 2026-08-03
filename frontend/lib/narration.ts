// The narration engine: one queue, one audio element, app-wide.
//
// Extracted from PlayButton so playback can outlive a single button.
// A "run" is one user gesture's worth of listening — a single passage, or
// a continuous read-through built by the page (passages, optionally each
// followed by its breakdown). The engine owns the queue and the single
// HTMLAudioElement; buttons and pages subscribe to render themselves.
//
// One element is deliberate: browsers bless it on the starting click, so
// auto-advancing to the next item keeps playing where a fresh Audio()
// per item would trip autoplay policies (Safari especially).

export type ContinueMode = "off" | "passages" | "reflections";

export type QueueItem = {
  /** Narration URL without the voice param (applied at play time). Also
      the item's identity: a button whose src matches is "this item". */
  src: string;
  passageId: string;
  kind: "passage" | "breakdown";
  /** Ensure the item can play (e.g. the breakdown text exists — audio
      404s otherwise). Resolve false to skip the item silently. */
  prepare?: () => Promise<boolean>;
  /** Start playback this many seconds in (click-to-jump on a word).
      Meaningful on the first item of a queue. */
  startAt?: number;
};

export type NarrationState =
  | "idle"
  | "loading"
  | "playing"
  | "paused" // suspended by the app (e.g. while a voice note records)
  | "failed";

export type NarrationSnapshot = {
  state: NarrationState;
  item: QueueItem | null;
};

// --- Device preferences (voice, pace, continue mode). All read at play
// time, so a change applies to the very next listen everywhere.

const VOICE_KEY = "astoicmind:tts-voice";

export const getVoicePref = (): string =>
  typeof window === "undefined" ? "" : (localStorage.getItem(VOICE_KEY) ?? "");

export const setVoicePref = (id: string): void => {
  if (id) localStorage.setItem(VOICE_KEY, id);
  else localStorage.removeItem(VOICE_KEY);
};

export const PACES = [0.75, 1, 1.25, 1.5, 2];
const PACE_KEY = "astoicmind:tts-pace";

export const getPacePref = (): number => {
  if (typeof window === "undefined") return 1;
  const v = Number(localStorage.getItem(PACE_KEY));
  return PACES.includes(v) ? v : 1;
};

export const setPacePref = (pace: number): void => {
  if (pace === 1) localStorage.removeItem(PACE_KEY);
  else localStorage.setItem(PACE_KEY, String(pace));
  // Adjust any narration already playing, so the change is audible live.
  if (audio) audio.playbackRate = pace;
};

const CONTINUE_KEY = "astoicmind:tts-continue";

export const getContinuePref = (): ContinueMode => {
  if (typeof window === "undefined") return "off";
  const v = localStorage.getItem(CONTINUE_KEY);
  return v === "passages" || v === "reflections" ? v : "off";
};

export const setContinuePref = (mode: ContinueMode): void => {
  if (mode === "off") localStorage.removeItem(CONTINUE_KEY);
  else localStorage.setItem(CONTINUE_KEY, mode);
  // The chip is only visible while narration plays, so a change must
  // apply to the run in flight: rebuild the queue around the current item.
  if (!builder) return;
  const cur = queue[index];
  if (!cur) return;
  const items = builder(mode);
  const at = items.findIndex((i) => i.src === cur.src);
  if (at >= 0) {
    queue = items;
    index = at;
  } else {
    // The current item fell out of the new plan (e.g. a breakdown while
    // switching to passages-only): let it finish, then follow the plan
    // from the passage it belongs to.
    const after = items.findIndex(
      (i) => i.kind === "passage" && i.passageId === cur.passageId
    );
    queue = after >= 0 ? [cur, ...items.slice(after + 1)] : [cur];
    index = 0;
  }
  prefetched = null;
  if (snapshot.state === "playing") prefetchNext();
  emit();
};

/** The narration URL with the chosen voice applied. */
export function withVoice(src: string): string {
  const v = getVoicePref();
  if (!v) return src;
  return src + (src.includes("?") ? "&" : "?") + "voice=" + encodeURIComponent(v);
}

// --- The engine.

let audio: HTMLAudioElement | null = null;
let queue: QueueItem[] = [];
let index = -1;
let builder: ((mode: ContinueMode) => QueueItem[]) | null = null;
// Bumped on every start/stop; async continuations from a stale run bail.
// The value at start doubles as the run's owner token.
let run = 0;
let prefetched: string | null = null;
// True while WE paused the element (a dictation interlude) — tells the
// pause handler apart from a hardware/OS pause, which means "stop".
let suspended = false;
// A pending word-level jump: play is held until the target second is inside
// the buffer (the audio endpoint has no Range support, so seeking past the
// buffer would restart the stream from zero).
let seekTarget: { t: number; token: number } | null = null;

const listeners = new Set<() => void>();
const IDLE: NarrationSnapshot = { state: "idle", item: null };
let snapshot: NarrationSnapshot = IDLE;

function emit(state?: NarrationState) {
  snapshot = {
    state: state ?? snapshot.state,
    item: queue[index] ?? null,
  };
  listeners.forEach((l) => l());
}

export const subscribeNarration = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getNarrationSnapshot = (): NarrationSnapshot => snapshot;
export const getServerNarrationSnapshot = (): NarrationSnapshot => IDLE;

// Debug peephole (harmless in prod; used by browser drives).
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__narrDebug = () => ({
    run,
    index,
    queueLen: queue.length,
    state: snapshot.state,
    src: snapshot.item?.src ?? null,
    suspended,
    t: audio?.currentTime ?? 0,
  });
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  a.preload = "auto";
  a.onplaying = () => {
    emit("playing");
    prefetchNext();
  };
  a.onended = () => advance(run);
  a.onprogress = trySeek;
  a.onloadeddata = trySeek;
  a.oncanplaythrough = trySeek;
  // Fires for hardware/OS pauses (headphones, media keys) — treat like a
  // stop, matching the old one-button behavior. Our own stop() clears the
  // src first, so `a.currentSrc` distinguishes the two.
  a.onpause = () => {
    if (suspended) return;
    if (!a.ended && a.currentSrc && snapshot.state === "playing") stop();
  };
  a.onerror = () => {
    if (a.currentSrc && snapshot.state !== "idle") {
      run++;
      builder = null;
      seekTarget = null;
      emit("failed");
    }
  };
  audio = a;
  return a;
}

/** Complete a pending word-level jump once the buffer has reached the
    target (or holds the whole file), then start playback there. */
function trySeek() {
  if (!seekTarget || !audio) return;
  if (seekTarget.token !== run) {
    seekTarget = null;
    return;
  }
  const a = audio;
  const end = a.buffered.length ? a.buffered.end(a.buffered.length - 1) : 0;
  if (end <= 0) return;
  const fullyLoaded = isFinite(a.duration) && end >= a.duration - 0.3;
  if (end < seekTarget.t + 0.2 && !fullyLoaded) return;
  const token = seekTarget.token;
  // Duration estimates lie for concatenated MP3s — clamp to the buffer.
  const target = Math.min(seekTarget.t, Math.max(0, end - 0.2));
  seekTarget = null;
  a.currentTime = target;
  a.play().catch(() => {
    if (token === run) {
      run++;
      builder = null;
      emit("failed");
    }
  });
}

/** Start a run. `build` is kept so a mid-flight continue-mode change can
    replan the queue. Returns the owner token for stopIfOwner. */
export function startNarration(
  build: (mode: ContinueMode) => QueueItem[]
): number {
  stop();
  const token = ++run;
  builder = build;
  queue = build(getContinuePref());
  index = -1;
  ensureAudio();
  advance(token);
  return token;
}

export function stopNarration(): void {
  stop();
}

/** Suspend playback without losing the queue — the dictation interlude.
    A no-op unless something is actually playing. */
export function pauseNarration(): void {
  if (snapshot.state !== "playing" || !audio) return;
  suspended = true;
  audio.pause();
  emit("paused");
}

/** Resume after pauseNarration. */
export function resumeNarration(): void {
  if (!suspended || !audio) return;
  suspended = false;
  const token = run;
  emit("loading");
  audio.play().catch(() => {
    if (token === run) {
      run++;
      builder = null;
      emit("failed");
    }
  });
}

/** Stop only if `token`'s run is still the one playing — a button
    unmounting shouldn't silence a run it didn't start. */
export function stopIfOwner(token: number): void {
  if (token === run) stop();
}

function stop() {
  run++;
  builder = null;
  queue = [];
  index = -1;
  prefetched = null;
  suspended = false;
  seekTarget = null;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src"); // abort any in-flight fetch
  }
  if (snapshot !== IDLE) {
    snapshot = IDLE;
    listeners.forEach((l) => l());
  }
}

async function advance(token: number) {
  if (token !== run) return;
  index++;
  const item = queue[index];
  if (!item) {
    stop();
    return;
  }
  emit("loading");
  if (item.prepare) {
    let ok = false;
    try {
      ok = await item.prepare();
    } catch {
      ok = false;
    }
    if (token !== run) return;
    if (!ok) {
      advance(token);
      return;
    }
  }
  const a = audio!;
  a.src = withVoice(item.src);
  a.playbackRate = getPacePref();
  if (item.startAt && item.startAt > 0.3) {
    // Hold playback until the buffer reaches the jump target; if buffering
    // stalls badly, give up on precision and play from the top.
    seekTarget = { t: item.startAt, token };
    window.setTimeout(() => {
      if (seekTarget && seekTarget.token === token && token === run) {
        seekTarget = null;
        a.play().catch(() => {
          if (token === run) {
            run++;
            builder = null;
            emit("failed");
          }
        });
      }
    }, 8000);
    trySeek(); // an already-cached file may be seekable immediately
    return;
  }
  a.play().catch(() => {
    if (token === run) {
      run++;
      builder = null;
      emit("failed");
    }
  });
}

/** Warm the next item while the current one plays: generate the breakdown
    text if needed, then fetch the audio so the browser cache (and the
    server's synthesis cache) are hot before the gap. */
function prefetchNext() {
  const next = queue[index + 1];
  if (!next || prefetched === next.src) return;
  prefetched = next.src;
  const token = run;
  (next.prepare ? next.prepare() : Promise.resolve(true))
    .then((ok) => {
      if (ok && token === run) return fetch(withVoice(next.src));
    })
    .catch(() => {
      // Best-effort only; the real play attempt reports errors.
    });
}
