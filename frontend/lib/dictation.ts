// Voice notes: an armed microphone during continuous narration.
//
// While narration plays and the listener has armed the mic chip, this
// module keeps a mic session open and watches it with a small
// voice-activity detector. When the listener starts talking, narration
// pauses, the speech records until ~2s of quiet, the recording is
// transcribed server-side, and the text is handed to the page's saver
// (a margin note on the passage being narrated). Narration then resumes.
//
// A second mode shares the same machinery: LIVE dictation (the mentor's
// voice mode). A page registers an utterance handler and the mic stays
// open regardless of narration state; a finished take STOPS any narration
// (talking over the mentor means "listen to me now") and the transcript
// goes to the handler instead of a note saver.
//
// Capture is raw PCM (a ScriptProcessor tap), not MediaRecorder: a rolling
// pre-buffer means the take includes the ~1.2s BEFORE speech was detected,
// so the first word of a note isn't clipped. Takes are downsampled to
// 16 kHz mono WAV — small, and all the transcriber needs for speech.
//
// The mic opens with echoCancellation on, so the narrator's own voice
// coming out of the speakers is suppressed from the signal (headphones
// make it a non-issue). The session exists only while narration is
// active — the browser's mic indicator going dark is the privacy story.
import { transcribeDictation } from "@/lib/api";
import {
  getNarrationSnapshot,
  pauseNarration,
  resumeNarration,
  stopNarration,
  subscribeNarration,
} from "@/lib/narration";

export type DictationStatus =
  | "off" // armed off, or no session
  | "denied" // mic permission refused
  | "listening"
  | "recording"
  | "transcribing"
  | "saved" // brief flash after a note lands
  | "error"; // brief flash when transcription/save failed

export type DictationSnapshot = {
  status: DictationStatus;
  armed: boolean;
  /** A page has registered a note saver (implies a signed-in user). */
  available: boolean;
  /** How loudly the detector hears the room right now (0..1) — surfaced
      so the mic chip can visibly react to the listener's voice. */
  level: number;
};

const ARMED_KEY = "astoicmind:voice-notes";

// --- VAD tuning (seconds). The noise floor adapts to ambient sound:
// drops instantly, rises slowly.
const PREROLL_SEC = 1.2; // kept from before speech onset
const ONSET_SEC = 0.25; // sustained speech to trigger
const SILENCE_SEC = 1.9; // sustained quiet to finish a take
// Live conversation is turn-taking, not note-taking: a shorter pause ends
// the utterance so the mentor can answer sooner. Voice notes keep the long
// window — mid-thought pauses while reading are normal there.
const LIVE_SILENCE_SEC = 1.2;
const MIN_SPEECH_SEC = 0.7; // shorter takes are discarded as false triggers
const MAX_TAKE_SEC = 120;
const UPLOAD_RATE = 16_000; // whisper-grade mono
// Absolute RMS bounds. Deliberately low: with the narrator playing
// through speakers, the browser's echo canceller can attenuate the
// listener's own voice quite a lot before it reaches us.
const ONSET_RMS = 0.012;
const RELEASE_RMS = 0.008;
const FLOOR_CAP = 0.03;

type Saver = (passageId: string, text: string) => Promise<void>;

let saver: Saver | null = null;
// Live mode (the mentor's voice conversation): while set, the mic stays
// open regardless of narration state and takes go here, not to `saver`.
let liveHandler: ((text: string) => void) | null = null;
let armed = false;
let status: DictationStatus = "off";

let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;
let opening = false;

let ring: Float32Array[] = [];
let ringSamples = 0;
let take: Float32Array[] = [];
let takeSamples = 0;
let recording = false;
let recPassage: string | null = null;
let aboveSec = 0;
let belowSec = 0;
let floor = 0.008;
let flashTimer: number | null = null;
let unsubNarration: (() => void) | null = null;
let level = 0;
let levelBucket = -1;

const listeners = new Set<() => void>();
const IDLE: DictationSnapshot = {
  status: "off",
  armed: false,
  available: false,
  level: 0,
};
let snapshot: DictationSnapshot = IDLE;

function emit() {
  snapshot = { status, armed, available: saver != null, level };
  listeners.forEach((l) => l());
}

function setStatus(s: DictationStatus) {
  status = s;
  emit();
}

export const subscribeDictation = (l: () => void): (() => void) => {
  listeners.add(l);
  attachWatcher();
  return () => listeners.delete(l);
};

export const getDictationSnapshot = (): DictationSnapshot => snapshot;
export const getServerDictationSnapshot = (): DictationSnapshot => IDLE;

function attachWatcher() {
  if (unsubNarration || typeof window === "undefined") return;
  armed = localStorage.getItem(ARMED_KEY) === "on";
  unsubNarration = subscribeNarration(sync);
}

/** A page offers itself as the destination for spoken notes (reader:
    margin note + local list update; daily page: margin note). Returns the
    cleanup to call on unmount. */
export function configureDictation(save: Saver): () => void {
  saver = save;
  attachWatcher();
  sync();
  emit();
  return () => {
    if (saver !== save) return;
    saver = null;
    sync();
    emit();
  };
}

/** Live mode: keep the mic open and hand every finished utterance to
    `onUtterance`. Call from a user gesture (the permission prompt needs
    one). Returns the cleanup that ends live listening. */
export function startLiveDictation(
  onUtterance: (text: string) => void
): () => void {
  liveHandler = onUtterance;
  attachWatcher();
  sync();
  emit();
  return () => {
    if (liveHandler !== onUtterance) return;
    liveHandler = null;
    sync();
    emit();
  };
}

/** The mic chip. Arming from a click is what earns the browser-permission
    prompt its user gesture. Disarming mid-recording discards the take. */
export function setVoiceNotesArmed(on: boolean): void {
  armed = on;
  if (on) localStorage.setItem(ARMED_KEY, "on");
  else {
    localStorage.removeItem(ARMED_KEY);
    recPassage = null; // a take in flight is discarded, not saved
    if (status === "denied") setStatus("off");
  }
  sync();
  emit();
}

function narrationActive(): boolean {
  const s = getNarrationSnapshot().state;
  return s === "playing" || s === "loading" || s === "paused";
}

function sync() {
  if (liveHandler || (saver && armed && narrationActive())) {
    void openSession();
    // Autoplay policy can leave a fresh context suspended; narration
    // events and chip clicks are frequent chances to nudge it awake.
    if (audioCtx && audioCtx.state === "suspended")
      audioCtx.resume().catch(() => {});
  } else {
    closeSession();
  }
}

async function openSession() {
  if (stream || opening || typeof navigator === "undefined") return;
  opening = true;
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    // Things may have changed while the permission prompt was up.
    if (!liveHandler && (!saver || !armed || !narrationActive())) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = s;
    audioCtx = new AudioContext();
    audioCtx.resume().catch(() => {});
    const source = audioCtx.createMediaStreamSource(s);
    // ScriptProcessor is deprecated but universal, and the only zero-setup
    // way to tap raw PCM (an AudioWorklet needs a served module file). It
    // must reach the destination to run — through a muted gain, so the mic
    // never feeds back to the speakers.
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = onAudio;
    const mute = audioCtx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioCtx.destination);
    ring = [];
    ringSamples = 0;
    take = [];
    takeSamples = 0;
    recording = false;
    aboveSec = 0;
    belowSec = 0;
    floor = 0.008;
    setStatus("listening");
  } catch {
    // Refused (or no mic): disarm so we don't re-prompt on every play.
    armed = false;
    localStorage.removeItem(ARMED_KEY);
    setStatus("denied");
  } finally {
    opening = false;
  }
}

function closeSession() {
  if (recording) finishTake(); // a take in flight still gets transcribed
  releaseMedia();
  if (status === "listening" || status === "recording") setStatus("off");
}

function releaseMedia() {
  if (processor) {
    processor.onaudioprocess = null;
    processor.disconnect();
    processor = null;
  }
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  ring = [];
  ringSamples = 0;
}

function onAudio(e: AudioProcessingEvent) {
  const input = e.inputBuffer.getChannelData(0);
  const sr = e.inputBuffer.sampleRate;
  const frameSec = input.length / sr;
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  const rms = Math.sqrt(sum / input.length);
  floor = rms < floor ? rms : Math.min(floor * 1.02 + 0.0002, FLOOR_CAP);
  if (floor < 0.0015) floor = 0.0015;
  const onset = Math.max(floor * 3, ONSET_RMS);
  const release = Math.max(floor * 2, RELEASE_RMS);
  const copy = new Float32Array(input); // the input buffer is reused

  // Feed the chip's level glow (quantized so renders stay rare).
  level = Math.min(1, rms * 12);
  const bucket = Math.round(level * 6);
  if (bucket !== levelBucket) {
    levelBucket = bucket;
    if (status === "listening" || status === "recording") emit();
  }

  if (!recording) {
    ring.push(copy);
    ringSamples += copy.length;
    while (ringSamples > sr * PREROLL_SEC && ring.length > 1) {
      ringSamples -= ring[0].length;
      ring.shift();
    }
    if (rms > onset) {
      aboveSec += frameSec;
      if (aboveSec >= ONSET_SEC) startTake();
    } else {
      aboveSec = 0;
    }
    return;
  }

  take.push(copy);
  takeSamples += copy.length;
  if (rms < release) {
    belowSec += frameSec;
    if (belowSec >= (liveHandler ? LIVE_SILENCE_SEC : SILENCE_SEC)) finishTake();
  } else {
    belowSec = 0;
  }
  if (recording && takeSamples > sr * MAX_TAKE_SEC) finishTake();
}

function startTake() {
  aboveSec = 0;
  const item = getNarrationSnapshot().item;
  // A voice note with no passage attached has nowhere to file; live mode
  // needs no destination beyond its handler.
  if (!liveHandler && (!item || !item.passageId)) return;
  recPassage = item?.passageId ?? null;
  take = ring; // the pre-roll: speech from before the detector fired
  takeSamples = ringSamples;
  ring = [];
  ringSamples = 0;
  belowSec = 0;
  recording = true;
  pauseNarration(); // a no-op when nothing is playing (live mode, idle)
  setStatus("recording");
}

function finishTake() {
  recording = false;
  const sr = audioCtx?.sampleRate ?? 48_000;
  const chunks = take;
  const samples = takeSamples;
  take = [];
  takeSamples = 0;
  const passageId = recPassage;
  recPassage = null;
  const save = saver;
  const live = liveHandler;
  const sessionLive = stream != null;
  const speechSec = samples / sr - PREROLL_SEC - belowSec;
  belowSec = 0;
  const real =
    speechSec >= MIN_SPEECH_SEC && (live != null || (passageId && save));
  if (!real) {
    // A false trigger: let the narration carry on as if nothing happened.
    resumeNarration();
    if (status === "recording") setStatus(sessionLive ? "listening" : "off");
    return;
  }
  if (live) {
    // Talking over the mentor means "stop and listen to me" — whatever was
    // playing is about to be answered anyway.
    stopNarration();
  } else {
    // A voice note: resume before transcribing — the listener shouldn't
    // wait on a network round-trip to keep hearing the text.
    resumeNarration();
  }
  setStatus("transcribing");
  const wav = encodeWav(chunks, samples, sr);
  transcribeDictation(wav, "audio/wav")
    .then(async (text) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setStatus(stream != null ? "listening" : "off");
        return;
      }
      if (live) {
        live(trimmed);
      } else {
        await save!(passageId!, trimmed);
      }
      flash("saved");
    })
    .catch(() => flash("error"));
}

/** Mono 16-bit WAV at UPLOAD_RATE, nearest-sample downsampled. */
function encodeWav(
  chunks: Float32Array[],
  totalSamples: number,
  sourceRate: number
): Blob {
  const flat = new Float32Array(totalSamples);
  let at = 0;
  for (const c of chunks) {
    flat.set(c, at);
    at += c.length;
  }
  const ratio = sourceRate / UPLOAD_RATE;
  const outLen = Math.floor(totalSamples / ratio);
  const buf = new ArrayBuffer(44 + outLen * 2);
  const v = new DataView(buf);
  const ws = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ws(0, "RIFF");
  v.setUint32(4, 36 + outLen * 2, true);
  ws(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, UPLOAD_RATE, true);
  v.setUint32(28, UPLOAD_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ws(36, "data");
  v.setUint32(40, outLen * 2, true);
  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, flat[Math.floor(i * ratio)]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

function flash(s: DictationStatus) {
  setStatus(s);
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    flashTimer = null;
    setStatus(stream != null ? "listening" : "off");
  }, 2500);
}
