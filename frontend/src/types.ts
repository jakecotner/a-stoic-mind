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
  /** The entry's reflection-thread conversation, when one exists. */
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
  date: string; // "YYYY-MM-DD"
  entries: number;
  passages_read: number;
}

export interface CalendarMonth {
  year: number;
  month: number;
  days: CalendarDay[]; // only days with activity
}

/** A passage in a day's reading history: enough to cite and link. */
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

/** A navigation request for the Reading view (sidebar / journal links). */
export type ReadingTarget =
  | { kind: "picker" }
  | { kind: "work"; work: string }
  | { kind: "position"; work: string; offset: number }
  | { kind: "passage"; passageId: number };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: string;
}
