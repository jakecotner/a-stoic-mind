// API client. All paths are relative — in dev and prod alike the browser
// talks to the Next origin, and next.config rewrites proxy /api/* to
// FastAPI, so the httponly session cookie rides along automatically
// (including on the streaming chat fetch below).
//
// Payload types come from lib/api-types.d.ts, generated from the backend's
// OpenAPI schema — after changing a backend response model, run
// `python scripts/export_openapi.py` (backend) then `npm run generate:types`
// and the compiler surfaces every affected call site.
import type { components } from "./api-types";

type Schema<K extends keyof components["schemas"]> = components["schemas"][K];

// --- Auth

export type AuthUser = Schema<"UserRead">;

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

/** Request a password-reset email. The server answers 202 whether or not
    the address exists (no account enumeration), so this resolves unless the
    server is unreachable. */
export async function forgotPassword(email: string): Promise<void> {
  const resp = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!resp.ok && resp.status !== 202)
    throw new Error("Could not reach the server — try again in a moment.");
}

/** Set a new password using the token from the reset email. */
export async function resetPassword(
  token: string,
  password: string,
): Promise<void> {
  const resp = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (resp.ok) return;
  let detail: unknown;
  try {
    detail = (await resp.json()).detail;
  } catch {
    /* no body */
  }
  if (detail === "RESET_PASSWORD_BAD_TOKEN")
    throw new Error(
      "That reset link has expired or was already used — request a new one.",
    );
  if (typeof detail === "object" && detail !== null && "reason" in detail)
    throw new Error(String((detail as { reason: unknown }).reason));
  throw new Error(`Could not reset the password (${resp.status})`);
}

/** Permanently delete the signed-in account and its data. */
export async function deleteAccount(): Promise<void> {
  const resp = await fetch("/api/auth/me", { method: "DELETE" });
  if (!resp.ok) throw new Error(`Could not delete the account (${resp.status})`);
}

// --- App meta (public feature flags — drives conditional UI like the
// verify-email banner)

export type AppMeta = Schema<"MetaOut">;

const META_FALLBACK: AppMeta = { require_email_verification: false };

/** Never throws — optional surfaces should stay hidden if this fails. */
export async function fetchMeta(): Promise<AppMeta> {
  try {
    const resp = await fetch("/api/meta");
    if (!resp.ok) return META_FALLBACK;
    return await resp.json();
  } catch {
    return META_FALLBACK;
  }
}

// --- Email verification (active only when the backend sets
// REQUIRE_EMAIL_VERIFICATION — see /api/meta)

/** Ask for a (re)send of the verification email. The server answers 202
    whether or not the address exists, so this resolves unless unreachable. */
export async function requestVerifyEmail(email: string): Promise<void> {
  const resp = await fetch("/api/auth/request-verify-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!resp.ok && resp.status !== 202)
    throw new Error("Could not reach the server — try again in a moment.");
}

/** Confirm the address using the token from the verification email. */
export async function verifyEmail(token: string): Promise<void> {
  const resp = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (resp.ok) return;
  let detail: unknown;
  try {
    detail = (await resp.json()).detail;
  } catch {
    /* no body */
  }
  if (detail === "VERIFY_USER_ALREADY_VERIFIED") return; // clicked twice — fine
  if (detail === "VERIFY_USER_BAD_TOKEN")
    throw new Error(
      "That verification link has expired or was already used — request a new one.",
    );
  throw new Error(`Could not verify the email (${resp.status})`);
}

// --- Daily passage (mirrors backend app/routes/daily.py — public)

export type Daily = Schema<"DailyOut">;

export async function fetchDaily(): Promise<Daily> {
  const resp = await fetch("/api/daily");
  if (!resp.ok)
    throw new Error(`Could not load today's passage (${resp.status})`);
  return resp.json();
}

// --- Corpus (mirrors backend app/routes/passage.py — public, read-only)

export type Work = Schema<"WorkOut">;
export type Passage = Schema<"PassageOut">;

export async function fetchWorks(): Promise<Work[]> {
  const resp = await fetch("/api/works");
  if (!resp.ok) throw new Error(`Could not load the library (${resp.status})`);
  return resp.json();
}

export async function fetchPassagesForWork(work: string): Promise<Passage[]> {
  const resp = await fetch(`/api/passages?work=${encodeURIComponent(work)}`);
  if (!resp.ok) throw new Error(`Could not load ${work} (${resp.status})`);
  return resp.json();
}

export async function fetchPassage(passageId: string): Promise<Passage> {
  const resp = await fetch(`/api/passages/${passageId}`);
  if (!resp.ok) throw new Error(`Could not load the passage (${resp.status})`);
  return resp.json();
}

// --- Journal (mirrors backend app/routes/journal.py — authed, private)

export type JournalEntry = Schema<"JournalEntryOut">;

/** Entries for one day (default: today). Signed out → empty list. */
export async function fetchJournal(on?: string): Promise<JournalEntry[]> {
  const resp = await fetch(`/api/journal${on ? `?on=${on}` : ""}`);
  if (resp.status === 401) return [];
  if (!resp.ok) throw new Error(`Could not load your journal (${resp.status})`);
  return resp.json();
}

export async function createJournalEntry(
  content: string,
  passageId?: string | null,
): Promise<JournalEntry> {
  const resp = await fetch("/api/journal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, passage_id: passageId ?? null }),
  });
  if (!resp.ok) throw new Error(`Could not save the entry (${resp.status})`);
  return resp.json();
}

export async function updateJournalEntry(
  entryId: string,
  content: string,
): Promise<JournalEntry> {
  const resp = await fetch(`/api/journal/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!resp.ok) throw new Error(`Could not update the entry (${resp.status})`);
  return resp.json();
}

export async function deleteJournalEntry(entryId: string): Promise<void> {
  const resp = await fetch(`/api/journal/${entryId}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(`Could not delete the entry (${resp.status})`);
}

// --- Chat (optional module — mirrors backend app/services/chat.py +
// app/routes/chat.py; delete together)

export type ChatMessage = Schema<"MessageOut">;
export type ConversationSummary = Schema<"ConversationSummary">;
export type ConversationDetail = Schema<"ConversationOut">;

/** Payload of a 402 from /api/chat (free-tier turn cap). */
export interface CapInfo {
  used: number | null;
  limit: number | null;
  message: string | null;
  /** "free" (signed-in monthly cap) or "anonymous" (per-IP taste allowance). */
  scope: string | null;
}

export interface StreamHandlers {
  onMeta: (meta: { conversation_id: string }) => void;
  onDelta: (text: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
  /** Free-tier monthly turn cap reached (HTTP 402). Optional; without it the
      cap surfaces through onError as plain text. */
  onCapHit?: (info: CapInfo) => void;
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
    meta?: (data: { conversation_id: string }) => void;
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
): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        conversation_id: conversationId ?? undefined,
      }),
    });
  } catch {
    handlers.onError("Could not reach the server — try again in a moment.");
    handlers.onDone();
    return;
  }
  if (resp.status === 402) {
    const info = await parseCapInfo(resp);
    if (handlers.onCapHit) handlers.onCapHit(info);
    else handlers.onError(info.message ?? "You've used this month's free turns.");
    handlers.onDone();
    return;
  }
  if (resp.status === 403) {
    // verification_required (REQUIRE_EMAIL_VERIFICATION on, account unverified)
    const info = await parseCapInfo(resp);
    handlers.onError(
      info.message ?? "Verify your email address to continue.",
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

export async function deleteConversation(id: string): Promise<void> {
  const resp = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(`Could not delete conversation (${resp.status})`);
}

// --- Billing. Every call degrades gracefully while Stripe isn't configured:
// summary falls back to a bare free tier, checkout/portal throw a readable
// "not live yet" message.

export type BillingSummary = Schema<"BillingSummary">;
export type Tier = BillingSummary["tier"];
export type BillingPlan = "annual" | "monthly";

const FREE_FALLBACK: BillingSummary = {
  tier: "free",
  turns: null,
  renews_at: null,
  cancel_at_period_end: false,
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
