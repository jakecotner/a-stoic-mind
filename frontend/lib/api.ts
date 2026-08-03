// API client. All paths are relative — in dev and prod alike the browser
// talks to the Next origin, and next.config rewrites proxy /api/* to
// FastAPI, so the httponly session cookie rides along automatically.
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

const META_FALLBACK: AppMeta = {
  require_email_verification: false,
  google_sign_in: false,
};

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

// --- Reader (mirrors backend app/routes/reading.py — TOC public; notes and
// reads authed, private)

export type TocPart = Schema<"TocPartOut">;
export type MarginNote = Schema<"NoteOut">;

export async function fetchToc(work: string): Promise<TocPart[]> {
  const resp = await fetch(`/api/works/toc?work=${encodeURIComponent(work)}`);
  if (!resp.ok) throw new Error(`Could not load ${work} (${resp.status})`);
  return resp.json();
}

/** The caller's margin notes across a work. Signed out → empty list. */
export async function fetchNotesForWork(work: string): Promise<MarginNote[]> {
  const resp = await fetch(`/api/notes?work=${encodeURIComponent(work)}`);
  if (resp.status === 401) return [];
  if (!resp.ok) throw new Error(`Could not load your notes (${resp.status})`);
  return resp.json();
}

export async function createNote(
  passageId: string,
  content: string,
): Promise<MarginNote> {
  const resp = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passage_id: passageId, content }),
  });
  if (!resp.ok) throw new Error(`Could not save the note (${resp.status})`);
  return resp.json();
}

export async function updateNote(
  noteId: string,
  content: string,
): Promise<MarginNote> {
  const resp = await fetch(`/api/notes/${noteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!resp.ok) throw new Error(`Could not update the note (${resp.status})`);
  return resp.json();
}

export async function deleteNote(noteId: string): Promise<void> {
  const resp = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(`Could not delete the note (${resp.status})`);
}

/** Passage ids of this work the caller has ever marked read. Signed out →
    empty list. */
export async function fetchReadIds(work: string): Promise<string[]> {
  const resp = await fetch(`/api/reads?work=${encodeURIComponent(work)}`);
  if (resp.status === 401) return [];
  if (!resp.ok) throw new Error(`Could not load reading history (${resp.status})`);
  return resp.json();
}

/** Record today's reading of a part. Returns how many passages were newly
    recorded (0 = already marked today). */
export async function markRead(work: string, part: string): Promise<number> {
  const resp = await fetch("/api/reads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ work, part }),
  });
  if (!resp.ok) throw new Error(`Could not mark as read (${resp.status})`);
  return (await resp.json()).marked;
}

export type Breakdown = Schema<"BreakdownOut">;

/** A passage's breakdown — generated and cached on first view, so the
    first request for a passage can take several seconds. `breakdown` is
    null when generation is unavailable. */
export async function fetchBreakdown(passageId: string): Promise<Breakdown> {
  const resp = await fetch(`/api/passages/${passageId}/breakdown`);
  if (!resp.ok) throw new Error(`Could not load the breakdown (${resp.status})`);
  return resp.json();
}

export async function fetchPassage(passageId: string): Promise<Passage> {
  const resp = await fetch(`/api/passages/${passageId}`);
  if (!resp.ok) throw new Error(`Could not load the passage (${resp.status})`);
  return resp.json();
}

// --- Narration (mirrors backend app/routes/audio.py — public). The audio
// itself is fetched by an <audio> element, not this client; these build the
// URLs (the PlayButton appends the device's voice preference).

export type Voice = Schema<"VoiceOut">;

export const passageAudioUrl = (passageId: string): string =>
  `/api/passages/${passageId}/audio`;

export const breakdownAudioUrl = (passageId: string): string =>
  `/api/passages/${passageId}/breakdown/audio`;

/** Speech-to-text for a dictated voice note (authed; shares the journal
    dictation endpoint). Returns the recognized text — saving is separate. */
export async function transcribeDictation(
  blob: Blob,
  mime: string,
): Promise<string> {
  const ext = mime.includes("wav") ? "wav" : mime.includes("mp4") ? "m4a" : "webm";
  const form = new FormData();
  form.append("file", blob, `note.${ext}`);
  const resp = await fetch("/api/journal/transcribe", {
    method: "POST",
    body: form,
  });
  if (!resp.ok) throw new Error(`Could not transcribe the note (${resp.status})`);
  const out: Schema<"TranscriptOut"> = await resp.json();
  return out.text;
}

/** Never throws — the voice picker simply stays hidden if this fails. */
export async function fetchVoices(): Promise<Voice[]> {
  try {
    const resp = await fetch("/api/tts/voices");
    if (!resp.ok) return [];
    return await resp.json();
  } catch {
    return [];
  }
}

// --- Journal (mirrors backend app/routes/journal.py — authed, private)

export type JournalEntry = Schema<"JournalEntryOut">;
export type JournalStats = Schema<"JournalStatsOut">;

/** Total entries + current daily streak. Signed out / error → null. */
export async function fetchJournalStats(): Promise<JournalStats | null> {
  const resp = await fetch("/api/journal/stats");
  if (!resp.ok) return null;
  return resp.json();
}

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

/** The free monthly reflection allowance is spent (HTTP 402). */
export class ReflectionCapError extends Error {
  used: number | null;
  limit: number | null;
  constructor(used: number | null, limit: number | null) {
    super("Monthly reflection allowance reached");
    this.used = used;
    this.limit = limit;
  }
}

/** Generate (or fetch the stored) reflection for an entry. Throws
    ReflectionCapError on the free-tier cap; a plain Error otherwise
    (verification required, generation unavailable, ...). */
export async function reflectOnEntry(entryId: string): Promise<JournalEntry> {
  const resp = await fetch(`/api/journal/${entryId}/reflection`, {
    method: "POST",
  });
  if (resp.status === 402) {
    let used: number | null = null;
    let limit: number | null = null;
    try {
      const detail = (await resp.json()).detail;
      used = detail?.used ?? null;
      limit = detail?.limit ?? null;
    } catch {
      /* fall through with nulls */
    }
    throw new ReflectionCapError(used, limit);
  }
  if (resp.status === 403) {
    throw new Error("Verify your email address to get reflections.");
  }
  if (!resp.ok) {
    throw new Error("Reflections aren't available right now.");
  }
  return resp.json();
}

// --- Practice (mirrors backend app/routes/practice.py — authed, private)

export type CalendarDay = Schema<"CalendarDayOut">;
export type DayDetail = Schema<"DayDetailOut">;
export type Intention = Schema<"IntentionOut">;

export async function fetchCalendar(
  year: number,
  month: number,
): Promise<CalendarDay[]> {
  const resp = await fetch(`/api/practice/calendar?year=${year}&month=${month}`);
  if (!resp.ok) throw new Error(`Could not load the calendar (${resp.status})`);
  return resp.json();
}

export async function fetchDayDetail(on: string): Promise<DayDetail> {
  const resp = await fetch(`/api/practice/day?on=${on}`);
  if (!resp.ok) throw new Error(`Could not load that day (${resp.status})`);
  return resp.json();
}

export async function fetchIntention(): Promise<Intention | null> {
  const resp = await fetch("/api/practice/intention");
  if (!resp.ok) return null;
  return resp.json();
}

export async function saveIntention(
  minutesPerDay: number,
  timeOfDay: string | null,
): Promise<Intention> {
  const resp = await fetch("/api/practice/intention", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      minutes_per_day: minutesPerDay,
      time_of_day: timeOfDay,
    }),
  });
  if (!resp.ok) throw new Error(`Could not save your intention (${resp.status})`);
  return resp.json();
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
