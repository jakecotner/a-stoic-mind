/**
 * Stoa API client. Port of stoa/frontend/src/api.ts with two differences:
 * - expo/fetch (WinterCG fetch with streaming bodies) instead of browser fetch
 * - auth is a bearer token from /api/auth/bearer/login, sent as an
 *   Authorization header, instead of the web app's httponly cookie
 */
import { fetch as expoFetch } from "expo/fetch";

import { API_BASE } from "./config";
import { clearToken, getToken, setToken } from "./token";
import type {
  BillingSummary,
  CalendarMonth,
  ConversationDetail,
  ConversationSummary,
  DayDetail,
  Note,
  PracticePlan,
  ReadingPage,
  Source,
  SynthesisMeta,
  TocSection,
  Work,
} from "./types";

type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};
type FetchResponse = Awaited<ReturnType<typeof expoFetch>>;

/** Fetch against the backend, attaching the bearer token when present. */
async function apiFetch(path: string, init: FetchInit = {}): Promise<FetchResponse> {
  const token = await getToken();
  const headers: Record<string, string> = { ...init.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  return expoFetch(`${API_BASE}${path}`, { ...init, headers });
}

export interface StreamHandlers {
  onMeta: (meta: { conversation_id: string; sources: Source[] }) => void;
  onDelta: (text: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

/** Readable message from a 402 (reflection cap / Plus-only feature). No
    upgrade path is offered in-app — App Store rules bar steering to external
    purchase, so the copy stands alone. */
async function paymentRequiredMessage(resp: FetchResponse): Promise<string> {
  try {
    const detail = (await resp.json()).detail;
    if (detail?.message) return detail.message;
    if (detail?.code === "plus_required") return "This is part of Stoa Plus.";
    if (detail?.limit != null)
      return `You've used this month's ${detail.limit} free reflections — they return at the start of next month.`;
  } catch {
    /* no payload */
  }
  return "You've used this month's free reflections — they return at the start of next month.";
}

/** Consume an SSE response body, dispatching events to handlers. */
async function consumeSse(
  resp: FetchResponse,
  on: {
    meta?: (data: any) => void;
    delta: (text: string) => void;
    error: (message: string) => void;
    done: () => void;
  },
): Promise<void> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleBlock = (block: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
    }
    if (dataLines.length === 0) return;
    const data = JSON.parse(dataLines.join("\n"));
    if (event === "meta") on.meta?.(data);
    else if (event === "error") on.error(data.error);
    else if (event === "done") on.done();
    else on.delta(data); // default event: a text delta (JSON string)
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (block.trim()) handleBlock(block);
    }
  }
}

/** POST /api/chat and consume the SSE response. */
export async function streamChat(
  message: string,
  conversationId: string | null,
  handlers: StreamHandlers,
  opts: {
    seedPassageId?: number | null;
    noteId?: string | null;
    /** Anchor a NEW conversation to this passage (Stoa Plus). */
    passageId?: number | null;
  } = {},
): Promise<void> {
  const resp = await apiFetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      conversation_id: conversationId ?? undefined,
      seed_passage_id: opts.seedPassageId ?? undefined,
      note_id: opts.noteId ?? undefined,
      passage_id: opts.passageId ?? undefined,
    }),
  });
  if (resp.status === 402) {
    handlers.onError(await paymentRequiredMessage(resp));
    handlers.onDone();
    return;
  }
  if (!resp.ok || !resp.body) {
    handlers.onError(`Request failed (${resp.status})`);
    handlers.onDone();
    return;
  }
  await consumeSse(resp, {
    meta: handlers.onMeta,
    delta: handlers.onDelta,
    error: handlers.onError,
    done: handlers.onDone,
  });
}

/** Stream the (cached) reflection for a passage. */
export async function streamReflection(
  passageId: number,
  handlers: {
    onMeta: (passage: Source) => void;
    onDelta: (text: string) => void;
    onError: (message: string) => void;
    onDone: () => void;
  },
): Promise<void> {
  const resp = await apiFetch(`/api/reflection/${passageId}`);
  if (!resp.ok || !resp.body) {
    handlers.onError(`Request failed (${resp.status})`);
    handlers.onDone();
    return;
  }
  await consumeSse(resp, {
    meta: (data) => handlers.onMeta(data.passage),
    delta: handlers.onDelta,
    error: handlers.onError,
    done: handlers.onDone,
  });
}

export async function fetchPassage(id: number): Promise<Source | null> {
  const resp = await apiFetch(`/api/passages/${id}`);
  if (!resp.ok) return null;
  return resp.json();
}

// --- Billing / Stoa Plus. Mobile is read-only about the plan: purchase and
// management live on the web (App Store rules for digital goods), so the app
// only needs to know the tier to show or hide Plus features.

/** null = signed out; a bare free summary when the endpoint isn't live. */
export async function fetchBillingSummary(): Promise<BillingSummary | null> {
  try {
    const resp = await apiFetch("/api/billing/summary");
    if (resp.status === 401) return null;
    if (!resp.ok) return { tier: "free", reflections: null, renews_at: null };
    return await resp.json();
  } catch {
    return { tier: "free", reflections: null, renews_at: null };
  }
}

// --- Weekly synthesis (Stoa Plus)

/** Stream the week's synthesis. peek never generates: it replays a stored
    synthesis or reports exists=false, so it's safe to call on load. */
export async function streamSynthesis(
  weekStart: string,
  opts: { refresh?: boolean; peek?: boolean },
  handlers: {
    onMeta: (meta: SynthesisMeta) => void;
    onDelta: (text: string) => void;
    onError: (message: string) => void;
    onDone: () => void;
  },
): Promise<void> {
  const params = new URLSearchParams({
    week_start: weekStart,
    // The server wants JS getTimezoneOffset semantics (minutes to ADD to
    // local to reach UTC) — the opposite sign of the calendar endpoints'
    // tz_offset helper below.
    tz_offset: String(new Date().getTimezoneOffset()),
  });
  if (opts.refresh) params.set("refresh", "true");
  if (opts.peek) params.set("peek", "true");
  let resp: FetchResponse;
  try {
    resp = await apiFetch(`/api/synthesis/week?${params}`);
  } catch {
    handlers.onError("Could not reach the server.");
    handlers.onDone();
    return;
  }
  if (resp.status === 402) {
    handlers.onError(await paymentRequiredMessage(resp));
    handlers.onDone();
    return;
  }
  if (!resp.ok || !resp.body) {
    handlers.onError(`Request failed (${resp.status})`);
    handlers.onDone();
    return;
  }
  await consumeSse(resp, {
    meta: handlers.onMeta,
    delta: handlers.onDelta,
    error: handlers.onError,
    done: handlers.onDone,
  });
}

// --- Cross-links (Stoa Plus). Suggestions, not search results: every
// failure mode (free tier, old backend, offline) degrades to an empty list.

export async function fetchRelatedPassages(noteId: string): Promise<Source[]> {
  try {
    const resp = await apiFetch(`/api/notes/${noteId}/related-passages`);
    if (!resp.ok) return [];
    return await resp.json();
  } catch {
    return [];
  }
}

export async function fetchRelatedNotes(passageId: number): Promise<Note[]> {
  try {
    const resp = await apiFetch(`/api/passages/${passageId}/related-notes`);
    if (!resp.ok) return [];
    return await resp.json();
  } catch {
    return [];
  }
}

/** The signed-in user's discussion thread on a passage (Stoa Plus), if any. */
export async function fetchPassageThread(
  passageId: number,
): Promise<string | null> {
  try {
    const resp = await apiFetch(`/api/passages/${passageId}/thread`);
    if (!resp.ok) return null;
    return (await resp.json()).conversation_id;
  } catch {
    return null;
  }
}

export async function fetchDaily(): Promise<Source | null> {
  const resp = await apiFetch("/api/daily");
  if (!resp.ok) return null;
  return resp.json();
}

// --- Auth. Bearer token from /api/auth/bearer/login, kept in SecureStore.

export interface AuthUser {
  id: string;
  email: string;
}

export async function fetchMe(): Promise<AuthUser | null> {
  const resp = await apiFetch("/api/auth/me");
  if (resp.status === 401) {
    // Token expired or revoked — drop it so we stop sending it.
    await clearToken();
    return null;
  }
  if (!resp.ok) return null;
  return resp.json();
}

async function authError(resp: FetchResponse, fallback: string): Promise<string> {
  try {
    const body = await resp.json();
    const detail = body.detail;
    if (detail === "LOGIN_BAD_CREDENTIALS") return "Incorrect email or password";
    if (detail === "REGISTER_USER_ALREADY_EXISTS")
      return "An account with that email already exists";
    if (typeof detail === "string") return detail.replace(/_/g, " ").toLowerCase();
    if (detail?.reason) return detail.reason;
  } catch {
    /* not JSON */
  }
  return fallback;
}

/** Throws with a readable message on failure. */
export async function register(email: string, password: string): Promise<void> {
  const resp = await apiFetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new Error(await authError(resp, "Registration failed"));
}

/** Throws with a readable message on failure. Stores the bearer token. */
export async function login(email: string, password: string): Promise<void> {
  const form = new URLSearchParams({ username: email, password });
  const resp = await expoFetch(`${API_BASE}/api/auth/bearer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!resp.ok) throw new Error(await authError(resp, "Sign-in failed"));
  const data = await resp.json();
  await setToken(data.access_token);
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/api/auth/bearer/logout", { method: "POST" });
  } finally {
    await clearToken();
  }
}

/** Permanently delete the account and everything it owns (App Store
    guideline 5.1.1(v) requires this to be reachable in-app). */
export async function deleteAccount(): Promise<void> {
  const resp = await apiFetch("/api/auth/me", { method: "DELETE" });
  if (!resp.ok) throw new Error(`Could not delete account (${resp.status})`);
  await clearToken();
}

// --- Reading

export async function fetchWorks(): Promise<Work[]> {
  const resp = await apiFetch("/api/works");
  if (!resp.ok) throw new Error(`Could not load works (${resp.status})`);
  return resp.json();
}

export async function fetchReadingPage(
  params: { work: string; offset: number } | { passageId: number },
  limit = 1,
): Promise<ReadingPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if ("passageId" in params) query.set("passage_id", String(params.passageId));
  else {
    query.set("work", params.work);
    query.set("offset", String(params.offset));
  }
  const resp = await apiFetch(`/api/reading/passages?${query}`);
  if (!resp.ok) throw new Error(`Could not load passages (${resp.status})`);
  return resp.json();
}

export async function fetchToc(work: string): Promise<TocSection[]> {
  const resp = await apiFetch(`/api/reading/toc?work=${encodeURIComponent(work)}`);
  if (!resp.ok) throw new Error(`Could not load contents (${resp.status})`);
  const data = await resp.json();
  return data.sections;
}

// --- Conversations (history; list requires auth)

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const resp = await apiFetch("/api/conversations");
  if (resp.status === 401) return [];
  if (!resp.ok) throw new Error(`Could not load conversations (${resp.status})`);
  return resp.json();
}

export async function fetchConversation(
  id: string,
): Promise<ConversationDetail | null> {
  const resp = await apiFetch(`/api/conversations/${id}`);
  if (!resp.ok) return null;
  return resp.json();
}

// --- Practice tracking / calendar (auth required)

/** Minutes to add to UTC to get local time — the server's tz_offset param. */
const tzOffset = () => -new Date().getTimezoneOffset();

/** Today's date in the phone's timezone, as YYYY-MM-DD. */
export function localDateISO(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Log passages as read today. Fire-and-forget: silently a no-op when signed
    out or offline — reading should never feel gated on bookkeeping. */
export async function trackReads(passageIds: number[]): Promise<void> {
  if (passageIds.length === 0) return;
  if ((await getToken()) === null) return;
  try {
    await apiFetch("/api/reads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passage_ids: passageIds, read_on: localDateISO() }),
    });
  } catch {
    /* never surface tracking failures */
  }
}

export async function fetchCalendarMonth(
  year: number,
  month: number,
): Promise<CalendarMonth> {
  const resp = await apiFetch(
    `/api/calendar/${year}/${month}?tz_offset=${tzOffset()}`,
  );
  if (!resp.ok) throw new Error(`Could not load calendar (${resp.status})`);
  return resp.json();
}

export async function fetchCalendarDay(dateISO: string): Promise<DayDetail> {
  const resp = await apiFetch(
    `/api/calendar/day/${dateISO}?tz_offset=${tzOffset()}`,
  );
  if (!resp.ok) throw new Error(`Could not load day (${resp.status})`);
  return resp.json();
}

// --- Practice plan (auth required; one per user)

export async function fetchPlan(): Promise<PracticePlan | null> {
  const resp = await apiFetch("/api/plan");
  if (!resp.ok) return null;
  return resp.json();
}

export async function savePlan(
  reminderTime: string,
  durationMinutes: number,
): Promise<PracticePlan> {
  const resp = await apiFetch("/api/plan", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reminder_time: reminderTime,
      duration_minutes: durationMinutes,
    }),
  });
  if (!resp.ok) throw new Error(`Could not save plan (${resp.status})`);
  return resp.json();
}

export async function deletePlan(): Promise<void> {
  const resp = await apiFetch("/api/plan", { method: "DELETE" });
  if (!resp.ok) throw new Error(`Could not remove plan (${resp.status})`);
}

// --- Notes / journal (auth required)

export async function fetchNotes(passageId?: number): Promise<Note[]> {
  const query = passageId != null ? `?passage_id=${passageId}` : "";
  const resp = await apiFetch(`/api/notes${query}`);
  if (resp.status === 401) return [];
  if (!resp.ok) throw new Error(`Could not load notes (${resp.status})`);
  return resp.json();
}

export async function createNote(
  content: string,
  passageId?: number,
): Promise<Note> {
  const resp = await apiFetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, passage_id: passageId ?? null }),
  });
  if (!resp.ok) throw new Error(`Could not save note (${resp.status})`);
  return resp.json();
}

export async function updateNote(id: string, content: string): Promise<Note> {
  const resp = await apiFetch(`/api/notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!resp.ok) throw new Error(`Could not update note (${resp.status})`);
  return resp.json();
}

export async function deleteNote(id: string): Promise<void> {
  const resp = await apiFetch(`/api/notes/${id}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(`Could not delete note (${resp.status})`);
}
