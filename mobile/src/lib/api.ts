// Mobile API client. Unlike the web frontend (which proxies /api/* through
// the Next origin and rides an httponly cookie), the phone talks straight to
// FastAPI and authenticates with a bearer token from /api/auth/bearer/login
// (see backend/app/core/auth.py â€” both transports share one JWT strategy).
//
// The token lives in the device keychain via expo-secure-store.
//
// Payload types come from api-types.d.ts, generated from the backend's
// OpenAPI schema and copied from frontend/lib/ â€” after changing a backend
// response model, regenerate there and re-copy (see README.md).
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import type { components } from './api-types';

type Schema<K extends keyof components['schemas']> = components['schemas'][K];

/** The backend's dev port. If the project spawn picked a different port
 * (8000 was taken), change it here â€” this is the one line the phone needs. */
const BACKEND_PORT = 8000;

const TOKEN_KEY = 'astoicmind_token';

/** Backend origin. EXPO_PUBLIC_API_URL wins (set it for preview/production
 * builds); in dev we derive it from the Metro host â€” the backend runs on the
 * same machine as Metro â€” so nobody has to hard-code a LAN IP. */
export function apiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.20:8081"
  if (hostUri) return `http://${hostUri.split(':')[0]}:${BACKEND_PORT}`;
  return `http://127.0.0.1:${BACKEND_PORT}`;
}

/** The web app's dev port (billing and account management live there). */
const WEB_PORT = 3000;

/** The web frontend's origin — for "manage it on the website" links.
 * EXPO_PUBLIC_WEB_URL wins (set it for preview/production builds); in dev
 * we derive it from the Metro host, like apiBaseUrl. */
export function webBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_WEB_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri.split(':')[0]}:${WEB_PORT}`;
  return `http://127.0.0.1:${WEB_PORT}`;
}

let cachedToken: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cachedToken === undefined) {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  }
  return cachedToken;
}

async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token === null) await SecureStore.deleteItemAsync(TOKEN_KEY);
  else await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/** fetch() against the backend with the bearer token attached. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
}

// --- Auth

export type AuthUser = Schema<'UserRead'>;

function readableAuthError(detail: unknown, fallback: string): string {
  if (detail === 'LOGIN_BAD_CREDENTIALS') return 'Incorrect email or password';
  if (detail === 'REGISTER_USER_ALREADY_EXISTS')
    return 'An account with that email already exists';
  if (typeof detail === 'string') return detail.replace(/_/g, ' ').toLowerCase();
  if (
    typeof detail === 'object' &&
    detail !== null &&
    'reason' in detail &&
    typeof (detail as { reason: unknown }).reason === 'string'
  )
    return (detail as { reason: string }).reason;
  return fallback;
}

async function authError(resp: Response, fallback: string): Promise<string> {
  try {
    return readableAuthError((await resp.json()).detail, fallback);
  } catch {
    return fallback;
  }
}

/** Logs in via the bearer transport and stores the token. Throws with a
 * readable message on failure. */
export async function login(email: string, password: string): Promise<void> {
  const form = new URLSearchParams({ username: email, password });
  let resp: Response;
  try {
    resp = await fetch(`${apiBaseUrl()}/api/auth/bearer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch {
    throw new Error(
      `Could not reach the server at ${apiBaseUrl()}. Is the backend running with --host 0.0.0.0, and is your phone on the same Wi-Fi?`
    );
  }
  if (!resp.ok) throw new Error(await authError(resp, 'Sign-in failed'));
  const body = (await resp.json()) as { access_token: string };
  await setToken(body.access_token);
}

/** Create an account, then sign in. Throws with a readable message. */
export async function register(email: string, password: string): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch(`${apiBaseUrl()}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error(
      `Could not reach the server at ${apiBaseUrl()}. Is the backend running with --host 0.0.0.0, and is your phone on the same Wi-Fi?`
    );
  }
  if (!resp.ok) throw new Error(await authError(resp, 'Registration failed'));
  await login(email, password);
}

export async function logout(): Promise<void> {
  await setToken(null);
}

/** Permanently delete the signed-in account and its data. */
export async function deleteAccount(): Promise<void> {
  const resp = await apiFetch('/api/auth/me', { method: 'DELETE' });
  if (!resp.ok) throw new Error(`Could not delete the account (${resp.status})`);
  await setToken(null);
}

/** The signed-in user, or null when the stored token is missing/expired. */
export async function fetchMe(): Promise<AuthUser | null> {
  if ((await getToken()) === null) return null;
  const resp = await apiFetch('/api/auth/me');
  if (!resp.ok) return null;
  return resp.json();
}

// --- Shared request helpers for domain endpoints

/** Pull the human-readable message out of a FastAPI error response
 * (including the metering module's turn-cap shape). */
async function detailError(resp: Response, fallback: string): Promise<string> {
  try {
    const detail = (await resp.json()).detail;
    if (typeof detail === 'string') return detail;
    if (detail?.code === 'turn_cap')
      return `You've used ${detail.used ?? 'all'} of your ${detail.limit ?? ''} free AI turns this month.`;
    if (detail?.message) return String(detail.message);
    if (detail?.reason) return String(detail.reason);
  } catch {
    /* not JSON */
  }
  return fallback;
}

/** GET that degrades to a fallback value on any failure (matching the web
 * client's "[] when signed out" convention). */
export async function getOr<T>(path: string, fallback: T): Promise<T> {
  try {
    const resp = await apiFetch(path);
    if (!resp.ok) return fallback;
    return await resp.json();
  } catch {
    return fallback;
  }
}

/** Mutating request that throws a readable message on failure. */
export async function send<T>(
  method: string,
  path: string,
  body: unknown,
  fallbackError: string
): Promise<T> {
  let resp: Response;
  try {
    resp = await apiFetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server â€” try again in a moment.');
  }
  if (!resp.ok) throw new Error(await detailError(resp, fallbackError));
  // 204s have no body.
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

// --- Daily passage (mirrors backend app/routes/daily.py — public)

export type Daily = Schema<'DailyOut'>;

export async function fetchDaily(): Promise<Daily | null> {
  return getOr<Daily | null>('/api/daily', null);
}

// --- Corpus (mirrors backend app/routes/passage.py — public, read-only)

export type Work = Schema<'WorkOut'>;
export type Passage = Schema<'PassageOut'>;
export type Breakdown = Schema<'BreakdownOut'>;
export type TocPart = Schema<'TocPartOut'>;

export async function fetchWorks(): Promise<Work[]> {
  return getOr<Work[]>('/api/works', []);
}

export async function fetchToc(work: string): Promise<TocPart[]> {
  return getOr<TocPart[]>(`/api/works/toc?work=${encodeURIComponent(work)}`, []);
}

export async function fetchPassages(work: string, part?: string): Promise<Passage[]> {
  const query =
    `work=${encodeURIComponent(work)}` +
    (part !== undefined && part !== '' ? `&part=${encodeURIComponent(part)}` : '');
  return getOr<Passage[]>(`/api/passages?${query}`, []);
}

/** A passage's breakdown — generated and cached on the first view, so the
 * first request for a passage can take several seconds. Null text = the
 * breakdown is unavailable; a null return = the request itself failed. */
export async function fetchBreakdown(passageId: string): Promise<Breakdown | null> {
  return getOr<Breakdown | null>(`/api/passages/${passageId}/breakdown`, null);
}

// --- Reader progress (mirrors backend app/routes/reading.py — authed)

export async function fetchReadIds(work: string): Promise<string[]> {
  return getOr<string[]>(`/api/reads?work=${encodeURIComponent(work)}`, []);
}

/** Record today's reading of a part. Returns how many passages were newly
 * recorded (0 = already marked today). */
export async function markRead(work: string, part: string): Promise<number> {
  const out = await send<{ marked: number }>(
    'POST',
    '/api/reads',
    { work, part },
    'Could not mark as read'
  );
  return out.marked;
}

// --- Narration (mirrors backend app/routes/audio.py — public). The audio
// endpoints are public and cache-forever, so players stream plain URLs.

export type Voice = Schema<'VoiceOut'>;

export const passageAudioUrl = (passageId: string): string =>
  `${apiBaseUrl()}/api/passages/${passageId}/audio`;

export const breakdownAudioUrl = (passageId: string): string =>
  `${apiBaseUrl()}/api/passages/${passageId}/breakdown/audio`;

/** Never throws — the voice picker simply stays hidden if this fails. */
export async function fetchVoices(): Promise<Voice[]> {
  return getOr<Voice[]>('/api/tts/voices', []);
}

// --- Journal (mirrors backend app/routes/journal.py — authed, private)

export type JournalEntry = Schema<'JournalEntryOut'>;
export type JournalStats = Schema<'JournalStatsOut'>;

export async function fetchJournalStats(): Promise<JournalStats | null> {
  return getOr<JournalStats | null>('/api/journal/stats', null);
}

/** Entries for one day (default: today). */
export async function fetchJournal(on?: string): Promise<JournalEntry[]> {
  return getOr<JournalEntry[]>(`/api/journal${on ? `?on=${on}` : ''}`, []);
}

export async function createJournalEntry(
  content: string,
  passageId?: string | null
): Promise<JournalEntry> {
  return send('POST', '/api/journal', { content, passage_id: passageId ?? null }, 'Could not save the entry');
}

export async function updateJournalEntry(entryId: string, content: string): Promise<JournalEntry> {
  return send('PATCH', `/api/journal/${entryId}`, { content }, 'Could not update the entry');
}

export async function deleteJournalEntry(entryId: string): Promise<void> {
  await send('DELETE', `/api/journal/${entryId}`, undefined, 'Could not delete the entry');
}

/** The free monthly reflection allowance is spent (HTTP 402). */
export class ReflectionCapError extends Error {
  limit: number | null;
  constructor(limit: number | null) {
    super('Monthly reflection allowance reached');
    this.limit = limit;
  }
}

/** Generate (or fetch the stored) reflection for an entry. Throws
 * ReflectionCapError on the free-tier cap; a plain Error otherwise. */
export async function reflectOnEntry(entryId: string): Promise<JournalEntry> {
  let resp: Response;
  try {
    resp = await apiFetch(`/api/journal/${entryId}/reflection`, { method: 'POST' });
  } catch {
    throw new Error('Could not reach the server — try again in a moment.');
  }
  if (resp.status === 402) {
    let limit: number | null = null;
    try {
      limit = (await resp.json()).detail?.limit ?? null;
    } catch {
      /* fall through with null */
    }
    throw new ReflectionCapError(limit);
  }
  if (resp.status === 403) throw new Error('Verify your email address to get reflections.');
  if (!resp.ok) throw new Error("Reflections aren't available right now.");
  return resp.json();
}

export type Transcript = Schema<'TranscriptOut'>;

/** Upload a dictation recording; resolves to the recognized text. */
export async function transcribeDictation(uri: string): Promise<string> {
  const form = new FormData();
  // React Native's FormData takes a file descriptor object, not a Blob.
  form.append('file', {
    uri,
    name: 'dictation.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);
  let resp: Response;
  try {
    // No explicit Content-Type: fetch sets the multipart boundary itself.
    resp = await apiFetch('/api/journal/transcribe', { method: 'POST', body: form });
  } catch {
    throw new Error('Could not reach the server — try again in a moment.');
  }
  if (!resp.ok) throw new Error(await detailError(resp, 'Could not transcribe the recording'));
  const out = (await resp.json()) as Transcript;
  return out.text;
}

// --- Practice (mirrors backend app/routes/practice.py — authed, private)

export type CalendarDay = Schema<'CalendarDayOut'>;
export type DayDetail = Schema<'DayDetailOut'>;
export type Intention = Schema<'IntentionOut'>;

export async function fetchCalendar(year: number, month: number): Promise<CalendarDay[]> {
  return getOr<CalendarDay[]>(`/api/practice/calendar?year=${year}&month=${month}`, []);
}

export async function fetchDayDetail(on: string): Promise<DayDetail | null> {
  return getOr<DayDetail | null>(`/api/practice/day?on=${on}`, null);
}

export async function fetchIntention(): Promise<Intention | null> {
  return getOr<Intention | null>('/api/practice/intention', null);
}

export async function saveIntention(
  minutesPerDay: number,
  timeOfDay: string | null
): Promise<Intention> {
  return send(
    'PUT',
    '/api/practice/intention',
    { minutes_per_day: minutesPerDay, time_of_day: timeOfDay },
    'Could not save your intention'
  );
}

// --- Practice sessions: one sitting, optionally structured by a guide.

export type Guide = Schema<'GuideOut'>;
export type GuideStep = Schema<'GuideStepOut'>;
export type PracticeSession = Schema<'SessionOut'>;

/** The guides are static content; an empty list just hides the launcher. */
export async function fetchGuides(): Promise<Guide[]> {
  return getOr<Guide[]>('/api/practice/guides', []);
}

export async function startPracticeSession(
  guide: Guide['key'] | null
): Promise<PracticeSession> {
  return send('POST', '/api/practice/sessions', { guide }, 'Could not start the session');
}

export async function endPracticeSession(
  sessionId: string,
  stepsCompleted: string[]
): Promise<PracticeSession> {
  return send(
    'POST',
    `/api/practice/sessions/${sessionId}/end`,
    { steps_completed: stepsCompleted },
    'Could not end the session'
  );
}

// --- Billing (read-only here — checkout and management happen on the
// website; the phone only shows the current plan)

export type BillingSummary = Schema<'BillingSummary'>;

const FREE_FALLBACK: BillingSummary = {
  tier: 'free',
  turns: null,
  renews_at: null,
  cancel_at_period_end: false,
};

export async function fetchBillingSummary(): Promise<BillingSummary> {
  return getOr<BillingSummary>('/api/billing/summary', FREE_FALLBACK);
}
