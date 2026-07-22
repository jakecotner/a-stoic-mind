// Mirrors stoa/frontend/src/types.ts — keep the two in sync when API
// responses change.

export interface Source {
  id: number;
  author: string;
  work: string;
  reference: string;
  translator: string;
  text: string;
}

export interface Work {
  work: string;
  author: string;
  translator: string;
  passage_count: number;
}

export interface ReadingPassage {
  id: number;
  reference: string;
  text: string;
}

export interface ReadingPage {
  work: string;
  total: number;
  offset: number;
  passages: ReadingPassage[];
}

export interface Note {
  id: string;
  passage_id: number | null;
  content: string;
  created_at: string;
  updated_at: string;
  passage: { id: number; work: string; reference: string } | null;
  /** Conversation anchored under this entry, if a reflection was started. */
  thread_id: string | null;
}

export interface TocSection {
  label: string;
  offset: number;
  count: number;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  created_at: string;
}

export interface ConversationDetail {
  id: string;
  title: string | null;
  created_at: string;
  messages: {
    id: string;
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }[];
}

// --- Practice calendar

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  entries: number;
  passages_read: number;
}

export interface CalendarMonth {
  year: number;
  month: number;
  days: CalendarDay[]; // only days with activity
}

export interface ReadPassageRef {
  id: number;
  author: string;
  work: string;
  reference: string;
}

export interface DayDetail {
  date: string;
  daily_passage: Source | null;
  notes: Note[];
  passages_read: ReadPassageRef[];
}

export interface PracticePlan {
  reminder_time: string; // "HH:MM", local wall time
  duration_minutes: number;
  updated_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: string;
}

// --- Billing / Stoa Plus

export interface BillingSummary {
  tier: "free" | "plus";
  /** Monthly reflection usage (free tier); null = uncapped (Plus, superuser). */
  reflections: { used: number; limit: number } | null;
  renews_at: string | null;
  cancel_at_period_end?: boolean;
}

/** Meta line preceding a weekly-synthesis stream. */
export interface SynthesisMeta {
  week_start: string;
  /** A synthesis exists (stored, or being generated right now). */
  exists: boolean;
  /** This stream replays a stored synthesis instead of generating. */
  cached: boolean;
  /** Entries currently in the week vs. entries the stored text covered. */
  entry_count: number;
  covered_count: number;
  generated_at: string | null;
}
