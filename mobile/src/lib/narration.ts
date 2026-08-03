// The narration engine — one queue, one player, app-wide. A direct port of
// the web's lib/narration.ts onto expo-audio: a "run" is one tap's worth of
// listening (a single passage, or a continuous read-through), buttons and
// screens subscribe to render themselves. Background playback is enabled in
// the audio mode, so a walk with the screen off keeps narrating.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import {
  getContinuePref,
  getPacePref,
  setContinuePref,
  setPacePref,
  withVoice,
  type ContinueMode,
} from '@/lib/prefs';

export type QueueItem = {
  /** Narration URL without the voice param (applied at play time). Also
      the item's identity: a button whose src matches is "this item". */
  src: string;
  passageId: string;
  kind: 'passage' | 'breakdown';
  /** Lock-screen "now playing" title (e.g. the passage reference). */
  title?: string;
  /** Ensure the item can play (e.g. the breakdown text exists — audio
      404s otherwise). Resolve false to skip the item silently. */
  prepare?: () => Promise<boolean>;
};

export type NarrationState = 'idle' | 'loading' | 'playing' | 'failed';

export type NarrationSnapshot = {
  state: NarrationState;
  item: QueueItem | null;
};

let player: AudioPlayer | null = null;
let queue: QueueItem[] = [];
let index = -1;
let builder: ((mode: ContinueMode) => QueueItem[]) | null = null;
// Bumped on every start/stop; async continuations from a stale run bail.
// The value at start doubles as the run's owner token.
let run = 0;
let prefetched: string | null = null;
// True once the current item audibly started — distinguishes an OS pause
// (interruption, headphones yanked) from our own loading shuffles.
let reachedPlaying = false;

const listeners = new Set<() => void>();
const IDLE: NarrationSnapshot = { state: 'idle', item: null };
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

type PlaybackStatus = {
  playing?: boolean;
  didJustFinish?: boolean;
  isLoaded?: boolean;
  error?: string | null;
};

// While a practice session runs, the user's own music (Spotify, anything)
// stays alive and ducks under narration instead of being silenced. Off by
// default: doNotMix is what keeps the lock-screen controls.
let sessionMixing = false;

function applyAudioMode() {
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: sessionMixing ? 'duckOthers' : 'doNotMix',
  }).catch(() => {});
}

export function setSessionMixing(active: boolean) {
  sessionMixing = active;
  applyAudioMode();
}

function ensurePlayer(): AudioPlayer {
  if (player) return player;
  // doNotMix is required for the lock-screen controls; background playback
  // keeps a walk narrated with the screen off.
  applyAudioMode();
  const p = createAudioPlayer();
  p.addListener('playbackStatusUpdate', (status: PlaybackStatus) => {
    if (status.error && snapshot.state !== 'idle' && snapshot.state !== 'failed') {
      fail();
      return;
    }
    if (status.didJustFinish && snapshot.state === 'playing') {
      reachedPlaying = false;
      advance(run);
      return;
    }
    if (status.playing && snapshot.state === 'loading') {
      reachedPlaying = true;
      emit('playing');
      prefetchNext();
      return;
    }
    // A loaded source that isn't playing while we expect it to: either the
    // play() call raced the load (nudge it), or the OS paused us mid-item
    // (interruption, headphones) — treat that like a stop, matching the web.
    if (!status.playing && snapshot.state === 'loading' && status.isLoaded) {
      p.play();
      return;
    }
    if (!status.playing && reachedPlaying && snapshot.state === 'playing') {
      stop();
    }
  });
  player = p;
  return p;
}

/** Start a run. `build` is kept so a mid-flight continue-mode change can
    replan the queue. Returns the owner token for stopIfOwner. */
export function startNarration(build: (mode: ContinueMode) => QueueItem[]): number {
  stop();
  const token = ++run;
  builder = build;
  queue = build(getContinuePref());
  index = -1;
  ensurePlayer();
  advance(token);
  return token;
}

export function stopNarration(): void {
  stop();
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
  reachedPlaying = false;
  if (player) {
    try {
      player.clearLockScreenControls();
    } catch {
      // Not active for the lock screen — nothing to clear.
    }
    player.pause();
    player.replace(null);
  }
  if (snapshot !== IDLE) {
    snapshot = IDLE;
    listeners.forEach((l) => l());
  }
}

function fail() {
  run++;
  builder = null;
  reachedPlaying = false;
  emit('failed');
}

async function advance(token: number) {
  if (token !== run) return;
  index++;
  const item = queue[index];
  if (!item) {
    stop();
    return;
  }
  reachedPlaying = false;
  emit('loading');
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
  // Confirm the audio exists before pointing the player at it — the first
  // listen anywhere synthesizes server-side (slow), and expo-audio has no
  // reliable error event, so a failed probe is our "audio unavailable".
  const url = withVoice(item.src);
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    if (token !== run) return;
    if (!resp.ok) {
      fail();
      return;
    }
  } catch {
    if (token === run) fail();
    return;
  }
  const p = ensurePlayer();
  p.replace(url);
  p.setPlaybackRate(getPacePref(), 'high');
  p.play();
  // Lock-screen "now playing" — on Android this is also what keeps
  // background playback alive past the OS's ~3-minute cap.
  try {
    p.setActiveForLockScreen(
      true,
      { title: item.title ?? 'Narration', artist: 'A Stoic Mind' },
      { showSeekBackward: false, showSeekForward: false }
    );
  } catch {
    // Lock-screen controls are a nicety — playback works without them.
  }
}

/** Warm the next item while the current one plays: generate the breakdown
    text if needed, then probe the audio so the server's synthesis cache is
    hot before the gap. */
function prefetchNext() {
  const next = queue[index + 1];
  if (!next || prefetched === next.src) return;
  prefetched = next.src;
  const token = run;
  (next.prepare ? next.prepare() : Promise.resolve(true))
    .then((ok) => {
      if (ok && token === run) return fetch(withVoice(next.src), { method: 'HEAD' });
    })
    .catch(() => {
      // Best-effort only; the real play attempt reports errors.
    });
}

/** Change the reading pace: persists the pref and applies it to narration
    already playing, so the change is audible live. */
export function setNarrationPace(pace: number): void {
  setPacePref(pace);
  player?.setPlaybackRate(getPacePref(), 'high');
}

/** Change the continue mode mid-run: persists the pref and replans the
    queue around the item currently playing (ported from the web engine). */
export function setNarrationContinueMode(mode: ContinueMode): void {
  setContinuePref(mode);
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
    const after = items.findIndex((i) => i.kind === 'passage' && i.passageId === cur.passageId);
    queue = after >= 0 ? [cur, ...items.slice(after + 1)] : [cur];
    index = 0;
  }
  prefetched = null;
  if (snapshot.state === 'playing') prefetchNext();
  emit();
}
