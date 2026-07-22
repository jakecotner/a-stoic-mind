import type {
  CalendarMonth,
  ConversationDetail,
  ConversationSummary,
  DayDetail,
  Language,
  Note,
  PracticePlan,
  ReadingPage,
  Source,
  TocSection,
  Voice,
  Work,
} from "./types";

export interface StreamHandlers {
  onMeta: (meta: { conversation_id: string; sources: Source[] }) => void;
  onDelta: (text: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
  /** Free-tier monthly reflection cap reached (HTTP 402). Optional; without
      it the cap surfaces through onError as plain text. */
  onCapHit?: (info: CapInfo) => void;
}

/** Payload of a 402 from /api/chat (see MONETIZATION.md §5 slice 2). */
export interface CapInfo {
  used: number | null;
  limit: number | null;
  message: string | null;
  /** "user" (signed-in monthly cap) or "anonymous" (per-IP taste allowance). */
  scope: string | null;
}

async function parseCapInfo(resp: Response): Promise<CapInfo> {
  const info: CapInfo = { used: null, limit: null, message: null, scope: null };
  try {
    const detail = (await resp.json()).detail;
    if (typeof detail === "string") info.message = detail;
    else if (detail) {
      info.used = detail.used ?? null;
      info.limit = detail.limit ?? null;
      info.message = detail.message ?? null;
      info.scope = detail.scope ?? null;
    }
  } catch {
    /* no payload; the caller falls back to generic copy */
  }
  return info;
}

/** Consume an SSE response body, dispatching events to handlers. */
async function consumeSse(
  resp: Response,
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
  seedPassageId?: number | null,
  noteId?: string | null,
  language?: string,
  passageId?: number | null,
): Promise<void> {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      conversation_id: conversationId ?? undefined,
      seed_passage_id: seedPassageId ?? undefined,
      note_id: noteId ?? undefined,
      language: language || undefined,
      passage_id: passageId ?? undefined,
    }),
  });
  if (resp.status === 402) {
    const info = await parseCapInfo(resp);
    if (handlers.onCapHit) handlers.onCapHit(info);
    else
      handlers.onError(
        info.message ?? "You've used this month's free reflections.",
      );
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

/** Stream the (cached) reflection for a passage, in the reading language. */
export async function streamReflection(
  passageId: number,
  language: string,
  handlers: {
    onMeta: (passage: Source) => void;
    onDelta: (text: string) => void;
    onError: (message: string) => void;
    onDone: () => void;
  },
): Promise<void> {
  const query = language ? `?language=${encodeURIComponent(language)}` : "";
  const resp = await fetch(`/api/reflection/${passageId}${query}`);
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

/** Meta line preceding a weekly-synthesis stream. */
export interface SynthesisMeta {
  week_start: string;
  /** A synthesis exists (stored, or being generated right now). */
  exists: boolean;
  /** This stream replays a stored synthesis instead of generating. */
  cached: boolean;
  /** Entries currently in the week vs. entries the stored text covered —
      more current than covered means a refresh would see new writing. */
  entry_count: number;
  covered_count: number;
  generated_at: string | null;
}

/** Stream the week's synthesis (Stoa Plus). peek never generates: it replays
    a stored synthesis or reports exists=false, so it's safe to call on load. */
export async function streamSynthesis(
  weekStart: string,
  opts: { language?: string; refresh?: boolean; peek?: boolean },
  handlers: {
    onMeta: (meta: SynthesisMeta) => void;
    onDelta: (text: string) => void;
    onError: (message: string) => void;
    onDone: () => void;
    /** 402: the account is on the free tier. */
    onPlusRequired?: () => void;
  },
): Promise<void> {
  const params = new URLSearchParams({
    week_start: weekStart,
    tz_offset: String(new Date().getTimezoneOffset()),
  });
  if (opts.language) params.set("language", opts.language);
  if (opts.refresh) params.set("refresh", "true");
  if (opts.peek) params.set("peek", "true");
  let resp: Response;
  try {
    resp = await fetch(`/api/synthesis/week?${params}`);
  } catch {
    handlers.onError("Could not reach the server — try again in a moment.");
    handlers.onDone();
    return;
  }
  if (resp.status === 402) {
    handlers.onPlusRequired?.();
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

export async function fetchPassage(id: number): Promise<Source | null> {
  const resp = await fetch(`/api/passages/${id}`);
  if (!resp.ok) return null;
  return resp.json();
}

// --- Cross-links (Stoa Plus): an entry's kindred passages and a passage's
// kindred entries. Suggestions, not search results — every failure mode
// (signed out, free tier, keyless server) degrades to an empty list.

export async function fetchRelatedPassages(noteId: string): Promise<Source[]> {
  try {
    const resp = await fetch(`/api/notes/${noteId}/related-passages`);
    if (!resp.ok) return [];
    return await resp.json();
  } catch {
    return [];
  }
}

export async function fetchRelatedNotes(passageId: number): Promise<Note[]> {
  try {
    const resp = await fetch(`/api/passages/${passageId}/related-notes`);
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
  const resp = await fetch(`/api/passages/${passageId}/thread`);
  if (!resp.ok) return null;
  return (await resp.json()).conversation_id;
}

export async function fetchDaily(): Promise<Source | null> {
  const resp = await fetch("/api/daily");
  if (!resp.ok) return null;
  return resp.json();
}

// --- Auth. The session is a JWT in an httponly cookie, so the browser sends
// it automatically (including on the /api/chat SSE fetch above).

export interface AuthUser {
  id: string;
  email: string;
  /** Account-level reading language; null = the published English. */
  language: string | null;
}

/** Persist the account-level reading language ("" clears it). */
export async function updateLanguage(language: string): Promise<void> {
  await fetch("/api/me/language", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language }),
  });
}

export async function fetchMe(): Promise<AuthUser | null> {
  const resp = await fetch("/api/auth/me");
  if (!resp.ok) return null;
  return resp.json();
}

async function authError(resp: Response, fallback: string): Promise<string> {
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
  const resp = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new Error(await authError(resp, "Registration failed"));
}

/** Throws with a readable message on failure. Sets the session cookie. */
export async function login(email: string, password: string): Promise<void> {
  const form = new URLSearchParams({ username: email, password });
  const resp = await fetch("/api/auth/login", { method: "POST", body: form });
  if (!resp.ok) throw new Error(await authError(resp, "Sign-in failed"));
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

// --- Practice tracking (calendar view). Auth via the session cookie; a 401
// (signed out) is deliberately ignored — reading is never gated on bookkeeping.

export function localDateISO(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Log passages as read today (client-local date). Fire-and-forget. */
export async function trackReads(passageIds: number[]): Promise<void> {
  if (passageIds.length === 0) return;
  try {
    await fetch("/api/reads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passage_ids: passageIds, read_on: localDateISO() }),
    });
  } catch {
    /* never surface tracking failures */
  }
}

// Minutes to ADD to UTC for the client's local time (backend convention).
const tzOffset = () => -new Date().getTimezoneOffset();

export async function fetchCalendarMonth(
  year: number,
  month: number,
): Promise<CalendarMonth> {
  const resp = await fetch(`/api/calendar/${year}/${month}?tz_offset=${tzOffset()}`);
  if (!resp.ok) throw new Error(`Could not load calendar (${resp.status})`);
  return resp.json();
}

export async function fetchCalendarDay(date: string): Promise<DayDetail> {
  const resp = await fetch(`/api/calendar/day/${date}?tz_offset=${tzOffset()}`);
  if (!resp.ok) throw new Error(`Could not load day (${resp.status})`);
  return resp.json();
}

// --- Practice plan (one per user; null when none has been made)

export async function fetchPlan(): Promise<PracticePlan | null> {
  const resp = await fetch("/api/plan");
  if (resp.status === 401) return null;
  if (!resp.ok) throw new Error(`Could not load plan (${resp.status})`);
  return resp.json();
}

export async function savePlan(
  reminderTime: string,
  durationMinutes: number,
): Promise<PracticePlan> {
  const resp = await fetch("/api/plan", {
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
  const resp = await fetch("/api/plan", { method: "DELETE" });
  if (!resp.ok) throw new Error(`Could not remove plan (${resp.status})`);
}

// --- Reading

export async function fetchWorks(): Promise<Work[]> {
  const resp = await fetch("/api/works");
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
  const resp = await fetch(`/api/reading/passages?${query}`);
  if (!resp.ok) throw new Error(`Could not load passages (${resp.status})`);
  return resp.json();
}

export async function fetchLanguages(): Promise<Language[]> {
  const resp = await fetch("/api/translation/languages");
  if (!resp.ok) throw new Error(`Could not load languages (${resp.status})`);
  return resp.json();
}

export async function fetchVoices(): Promise<Voice[]> {
  const resp = await fetch("/api/tts/voices");
  if (!resp.ok) throw new Error(`Could not load voices (${resp.status})`);
  return resp.json();
}

/** Stream the (cached) translation of a passage into a target language. */
export async function streamTranslation(
  passageId: number,
  language: string,
  handlers: {
    onDelta: (text: string) => void;
    onError: (message: string) => void;
    onDone: () => void;
  },
): Promise<void> {
  const resp = await fetch(
    `/api/passages/${passageId}/translation?language=${encodeURIComponent(language)}`,
  );
  if (!resp.ok || !resp.body) {
    handlers.onError(`Request failed (${resp.status})`);
    handlers.onDone();
    return;
  }
  await consumeSse(resp, {
    delta: handlers.onDelta,
    error: handlers.onError,
    done: handlers.onDone,
  });
}

export async function fetchToc(work: string): Promise<TocSection[]> {
  const resp = await fetch(`/api/reading/toc?work=${encodeURIComponent(work)}`);
  if (!resp.ok) throw new Error(`Could not load contents (${resp.status})`);
  const data = await resp.json();
  return data.sections;
}

// --- Conversations (sidebar history; list requires auth)

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const resp = await fetch("/api/conversations");
  if (resp.status === 401) return [];
  if (!resp.ok) throw new Error(`Could not load conversations (${resp.status})`);
  return resp.json();
}

export async function fetchConversation(
  id: string,
): Promise<ConversationDetail | null> {
  const resp = await fetch(`/api/conversations/${id}`);
  if (!resp.ok) return null;
  return resp.json();
}

// --- Notes / journal (auth required; the cookie rides along automatically)

export async function fetchNotes(passageId?: number): Promise<Note[]> {
  const query = passageId != null ? `?passage_id=${passageId}` : "";
  const resp = await fetch(`/api/notes${query}`);
  if (resp.status === 401) return [];
  if (!resp.ok) throw new Error(`Could not load notes (${resp.status})`);
  return resp.json();
}

export async function createNote(
  content: string,
  passageId?: number,
): Promise<Note> {
  const resp = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, passage_id: passageId ?? null }),
  });
  if (!resp.ok) throw new Error(`Could not save note (${resp.status})`);
  return resp.json();
}

export async function updateNote(id: string, content: string): Promise<Note> {
  const resp = await fetch(`/api/notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!resp.ok) throw new Error(`Could not update note (${resp.status})`);
  return resp.json();
}

export async function deleteNote(id: string): Promise<void> {
  const resp = await fetch(`/api/notes/${id}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(`Could not delete note (${resp.status})`);
}

// --- Billing / Stoa Plus (MONETIZATION.md §5). The UI ships ahead of the
// backend slices, so every call here degrades gracefully while the endpoints
// don't exist yet: summary falls back to a bare free tier, checkout/portal
// throw a readable "not live yet" message.

export type Tier = "free" | "plus";
export type BillingPlan = "annual" | "monthly";

export interface BillingSummary {
  tier: Tier;
  /** Monthly reflection usage (free tier); null until the backend meters it. */
  reflections: { used: number; limit: number } | null;
  /** Next renewal date (ISO) for Plus, when known. */
  renews_at: string | null;
  /** Plus subscription cancelled but paid through renews_at. */
  cancel_at_period_end?: boolean;
}

const FREE_FALLBACK: BillingSummary = {
  tier: "free",
  reflections: null,
  renews_at: null,
};

/** null = signed out; a bare free summary when the endpoint isn't live. */
export async function fetchBillingSummary(): Promise<BillingSummary | null> {
  try {
    const resp = await fetch("/api/billing/summary");
    if (resp.status === 401) return null;
    if (!resp.ok) return FREE_FALLBACK;
    return await resp.json();
  } catch {
    return FREE_FALLBACK;
  }
}

/** Begin Stripe Checkout; resolves by navigating away. Throws if unavailable. */
export async function startCheckout(plan: BillingPlan): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
  } catch {
    throw new Error("Could not reach the server — try again in a moment.");
  }
  if (!resp.ok)
    throw new Error("Payments aren't quite live yet — check back soon.");
  const { url } = await resp.json();
  window.location.href = url;
}

/** Open the Stripe customer portal (Plus users manage/cancel there). */
export async function openBillingPortal(): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch("/api/billing/portal", { method: "POST" });
  } catch {
    throw new Error("Could not reach the server — try again in a moment.");
  }
  if (!resp.ok) throw new Error("The billing portal isn't available yet.");
  const { url } = await resp.json();
  window.location.href = url;
}
