// Device listening preferences (voice, pace, continue mode), mirroring the
// web's localStorage prefs. SecureStore is async, so the values live in
// module memory for synchronous reads at play time and are loaded once at
// launch (loadPrefs, called from the root layout).
import * as SecureStore from 'expo-secure-store';

export const PACES = [0.75, 1, 1.25, 1.5, 2];

export type ContinueMode = 'off' | 'passages' | 'reflections';

const VOICE_KEY = 'astoicmind_tts_voice';
const PACE_KEY = 'astoicmind_tts_pace';
const CONTINUE_KEY = 'astoicmind_tts_continue';

let voice = '';
let pace = 1;
let continueMode: ContinueMode = 'off';

export async function loadPrefs(): Promise<void> {
  try {
    const [v, p, c] = await Promise.all([
      SecureStore.getItemAsync(VOICE_KEY),
      SecureStore.getItemAsync(PACE_KEY),
      SecureStore.getItemAsync(CONTINUE_KEY),
    ]);
    voice = v ?? '';
    const parsed = Number(p);
    pace = PACES.includes(parsed) ? parsed : 1;
    continueMode = c === 'passages' || c === 'reflections' ? c : 'off';
  } catch {
    // Defaults stand — preferences are a convenience, never a blocker.
  }
}

function persist(key: string, value: string | null): void {
  (value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value)).catch(
    () => {}
  );
}

export const getVoicePref = (): string => voice;

export function setVoicePref(id: string): void {
  voice = id;
  persist(VOICE_KEY, id || null);
}

export const getPacePref = (): number => pace;

export function setPacePref(next: number): void {
  pace = PACES.includes(next) ? next : 1;
  persist(PACE_KEY, pace === 1 ? null : String(pace));
}

export const getContinuePref = (): ContinueMode => continueMode;

export function setContinuePref(mode: ContinueMode): void {
  continueMode = mode;
  persist(CONTINUE_KEY, mode === 'off' ? null : mode);
}

/** The narration URL with the chosen voice applied. */
export function withVoice(src: string): string {
  if (!voice) return src;
  return src + (src.includes('?') ? '&' : '?') + 'voice=' + encodeURIComponent(voice);
}
