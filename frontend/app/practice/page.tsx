"use client";

// The practice page, split like the rest of the app: the month calendar on
// the left — a month of your practice at a glance, with the standing
// intention (minutes per day, preferred time) above it — and the selected
// day's detail on the right (the shared daily passage plus your own
// journaling, margin notes, and reading).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BoldMarkdown from "@/components/BoldMarkdown";
import SessionCanvas from "@/components/SessionCanvas";
import {
  fetchBillingSummary,
  fetchCalendar,
  fetchDayDetail,
  fetchGuides,
  fetchIntention,
  saveIntention,
  type CalendarDay,
  type DayDetail,
  type Guide,
  type Intention,
} from "@/lib/api";
import { primeAudio } from "@/lib/narration";
import { useUser } from "@/lib/useUser";

// The written/spoken choice lives on the launcher (point of use) and the
// last choice sticks, like the narration voice and pace prefs.
const MODE_KEY = "astoicmind:practice-mode";
type SessionMode = "written" | "spoken";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const subtleButtonCls =
  "rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "06:30:00" -> "6:30am" */
function formatTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)}${h >= 12 ? "pm" : "am"}`;
}

function IntentionBar() {
  const [intention, setIntention] = useState<Intention | null>(null);
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState("15");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchIntention()
      .then((i) => {
        setIntention(i);
        if (i) {
          setMinutes(String(i.minutes_per_day));
          setTime(i.time_of_day ? i.time_of_day.slice(0, 5) : "");
        }
      })
      .catch(() => {});
  }, []);

  if (editing || intention === null) {
    return (
      <form
        className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 p-4 text-sm dark:border-white/15"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            setIntention(
              await saveIntention(Number(minutes), time ? time : null),
            );
            setEditing(false);
          } catch {
            /* stays editable */
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="font-medium">My intention:</span>
        <label className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={480}
            className="w-16 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          minutes a day
        </label>
        <label className="flex items-center gap-1">
          at
          <input
            type="time"
            className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <span className="opacity-60">(optional)</span>
        </label>
        <button
          type="submit"
          disabled={busy || !minutes}
          className="rounded-lg bg-foreground px-3 py-1.5 font-medium text-background hover:opacity-85 disabled:opacity-40"
        >
          Save
        </button>
        {intention !== null && (
          <button
            type="button"
            className={subtleButtonCls}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 p-4 text-sm dark:border-white/15">
      <span>
        <span className="font-medium">My intention:</span>{" "}
        {intention.minutes_per_day} minutes a day
        {intention.time_of_day && ` at ${formatTime(intention.time_of_day)}`}
      </span>
      <button className={subtleButtonCls} onClick={() => setEditing(true)}>
        Edit
      </button>
    </div>
  );
}

function DayPanel({ detail }: { detail: DayDetail }) {
  const [y, m, d] = detail.date.split("-").map(Number);
  const title = new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const empty =
    detail.journal.length === 0 &&
    detail.notes.length === 0 &&
    detail.reads.length === 0 &&
    detail.sessions.length === 0;

  return (
    <section>
      <h2 className="mb-4 text-lg font-medium">{title}</h2>

      {detail.daily && (
        <div className="mb-5">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide opacity-60">
            Daily passage
          </h3>
          <p className="text-sm font-medium">{detail.daily.reference}</p>
          <blockquote className="mt-1 whitespace-pre-line text-sm leading-relaxed opacity-90">
            {detail.daily.text}
          </blockquote>
        </div>
      )}

      {detail.sessions.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide opacity-60">
            Sessions
          </h3>
          <ul className="text-sm">
            {detail.sessions.map((s) => (
              <li key={s.id}>
                {s.guide === "morning"
                  ? "Morning preparation"
                  : s.guide === "evening"
                    ? "Evening review"
                    : "Freeform practice"}{" "}
                <span className="opacity-60">
                  — {Math.max(1, Math.round((s.duration_seconds ?? 0) / 60))} min
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.reads.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide opacity-60">
            Read
          </h3>
          <ul className="text-sm">
            {detail.reads.map((r) => (
              <li key={r.work}>
                {r.work}{" "}
                <span className="opacity-60">
                  ({r.author}) — {r.passage_count} passages
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.journal.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide opacity-60">
            Journal
          </h3>
          <div className="flex flex-col gap-2">
            {detail.journal.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
              >
                <p className="whitespace-pre-line leading-relaxed">
                  {e.content}
                </p>
                {e.reflection && (
                  <div className="mt-3 border-l-2 border-black/15 pl-3 dark:border-white/25">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-50">
                      Reflection
                    </p>
                    <BoldMarkdown text={e.reflection} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {detail.notes.length > 0 && (
        <div className="mb-1">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide opacity-60">
            Margin notes
          </h3>
          <div className="flex flex-col gap-2">
            {detail.notes.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
              >
                {n.passage_reference && (
                  <p className="mb-1 text-xs opacity-60">
                    {n.passage_reference}
                  </p>
                )}
                <p className="whitespace-pre-line leading-relaxed">
                  {n.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {empty && (
        <p className="text-sm opacity-60">
          Nothing recorded this day — the practice continues tomorrow.
        </p>
      )}
    </section>
  );
}

export default function PracticePage() {
  const { user, loading } = useUser();

  const today = new Date();
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [selected, setSelected] = useState<string | null>(
    `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
  );
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  // null = no session running; { guide: null } = a freeform session.
  const [session, setSession] = useState<{
    guide: Guide | null;
    spoken: boolean;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [mode, setMode] = useState<SessionMode>("written");
  // Plus status, for the launcher hint only — the backend is the real gate.
  // null = unknown (billing unreachable): no hint, the gate still answers.
  const [plus, setPlus] = useState<boolean | null>(null);

  useEffect(() => {
    fetchGuides().then(setGuides);
    // Read after mount — localStorage isn't there for the server render.
    if (localStorage.getItem(MODE_KEY) === "spoken") setMode("spoken");
  }, []);

  const chooseMode = (m: SessionMode) => {
    setMode(m);
    if (m === "spoken") localStorage.setItem(MODE_KEY, "spoken");
    else localStorage.removeItem(MODE_KEY);
  };

  useEffect(() => {
    if (!user) return;
    if (user.is_superuser) {
      setPlus(true);
      return;
    }
    fetchBillingSummary()
      .then((b) => setPlus(b ? b.tier === "plus" : null))
      .catch(() => setPlus(null));
  }, [user]);

  // Signed out, the calendar is still worth seeing: an empty month, ready
  // to be filled — built locally, since the practice API needs an account.
  useEffect(() => {
    if (!user) {
      const count = new Date(view.year, view.month, 0).getDate();
      setDays(
        Array.from({ length: count }, (_, i) => ({
          date: `${view.year}-${pad(view.month)}-${pad(i + 1)}`,
          daily_reference: null,
          journal_count: 0,
          note_count: 0,
          read_count: 0,
          session_count: 0,
          practice_seconds: 0,
        })),
      );
      return;
    }
    fetchCalendar(view.year, view.month)
      .then(setDays)
      .catch(() => {});
  }, [user, view, refresh]);

  useEffect(() => {
    if (!user || !selected) {
      setDetail(null);
      return;
    }
    fetchDayDetail(selected)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [user, selected, refresh]);

  const shift = useCallback((delta: number) => {
    setView((v) => {
      const idx = v.year * 12 + (v.month - 1) + delta;
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    });
  }, []);

  if (loading) return null;

  // A running session takes over the whole screen — one thing at a time.
  if (session) {
    return (
      <SessionCanvas
        guide={session.guide}
        mode={session.spoken && session.guide ? "spoken" : "written"}
        onDone={() => {
          setSession(null);
          setRefresh((n) => n + 1);
        }}
      />
    );
  }

  const firstWeekday = new Date(view.year, view.month - 1, 1).getDay();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-10 lg:grid-cols-2">
      {/* Left: the intention and the month at a glance */}
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Practice</h1>

        {user ? (
          <IntentionBar />
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-black/10 p-4 text-sm dark:border-white/15">
            <p className="opacity-75">
              Morning and evening sits, guided by the Stoics, recorded on a
              calendar alongside your reading and journaling. Create an
              account to keep your practice.
            </p>
            <span className="flex items-center gap-3">
              <Link
                href="/register"
                className="rounded-lg bg-foreground px-4 py-2 font-medium text-background hover:opacity-85"
              >
                Start practicing
              </Link>
              <Link href="/login" className="text-xs underline opacity-70 hover:opacity-100">
                Sign in
              </Link>
            </span>
          </div>
        )}

        {/* Begin a session: the guides, or an unstructured sit. Playing your
            own music alongside (Spotify or anything else) works fine — the
            session doesn't touch it. */}
        <section className="rounded-xl border border-black/10 p-4 dark:border-white/15">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Begin a session</p>
            {user && (
              <span
                className="flex items-center gap-1 text-xs"
                title="Written: type your responses. Spoken: the mentor guides you by voice and responds to your thinking out loud (Plus)."
              >
                {(["written", "spoken"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => chooseMode(m)}
                    className={`rounded-full border px-2.5 py-0.5 ${
                      mode === m
                        ? "border-black/40 font-medium dark:border-white/60"
                        : "border-black/15 opacity-60 hover:opacity-100 dark:border-white/20"
                    }`}
                  >
                    {m === "written" ? "Written" : "Spoken"}
                  </button>
                ))}
              </span>
            )}
          </div>
          {user && mode === "spoken" && plus === false && (
            <p className="mb-3 text-xs opacity-70">
              Spoken sessions are a Plus feature —{" "}
              <Link href="/account" className="underline">
                upgrade
              </Link>{" "}
              to have the mentor guide your sitting by voice.
            </p>
          )}
          {user ? (
            <div className="flex flex-wrap gap-2">
              {guides.map((g) => (
                <button
                  key={g.key}
                  title={g.tagline}
                  className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-85"
                  onClick={() => {
                    // The click is the user gesture that blesses the audio
                    // element for the spoken flow's programmatic playback.
                    if (mode === "spoken") primeAudio();
                    setSession({ guide: g, spoken: mode === "spoken" });
                  }}
                >
                  {g.title}
                </button>
              ))}
              <button
                className={subtleButtonCls}
                title="An unguided sit — written, whatever the mode"
                onClick={() => setSession({ guide: null, spoken: false })}
              >
                Just practice
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              {guides.map((g) => (
                <p key={g.key}>
                  <span className="font-medium">{g.title}</span>{" "}
                  <span className="opacity-60">— {g.tagline}</span>
                </p>
              ))}
              <p className="opacity-60">
                <span className="font-medium opacity-100">Just practice</span>{" "}
                — an unguided sit, timed and recorded.
              </p>
              <p className="mt-1 text-xs opacity-60">
                <Link href="/login" className="underline hover:opacity-80">
                  Sign in
                </Link>{" "}
                to begin a session — each one lands on your calendar.
              </p>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <button className={subtleButtonCls} onClick={() => shift(-1)}>
              ← previous
            </button>
            <h2 className="font-medium">
              {MONTHS[view.month - 1]} {view.year}
            </h2>
            <button className={subtleButtonCls} onClick={() => shift(1)}>
              next →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs opacity-60">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {days.map((day) => {
              const n = Number(day.date.slice(-2));
              const isSelected = day.date === selected;
              const isToday = day.date === todayStr;
              return (
                <button
                  key={day.date}
                  onClick={() => setSelected(day.date)}
                  title={day.daily_reference ?? undefined}
                  className={`flex min-h-16 flex-col items-start gap-1 rounded-lg border p-2 text-left text-sm ${
                    isSelected
                      ? "border-black/60 dark:border-white/70"
                      : "border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  }`}
                >
                  <span className={isToday ? "font-semibold underline" : ""}>
                    {n}
                  </span>
                  <span className="flex flex-wrap gap-1 text-[10px] leading-none">
                    {day.session_count > 0 && (
                      <span
                        title={`${day.session_count} ${day.session_count === 1 ? "session" : "sessions"} — ${Math.max(1, Math.round(day.practice_seconds / 60))} min`}
                        className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/15"
                      >
                        S
                      </span>
                    )}
                    {day.read_count > 0 && (
                      <span
                        title={`${day.read_count} passages read`}
                        className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/15"
                      >
                        R
                      </span>
                    )}
                    {day.journal_count > 0 && (
                      <span
                        title={`${day.journal_count} journal ${day.journal_count === 1 ? "entry" : "entries"}`}
                        className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/15"
                      >
                        J
                      </span>
                    )}
                    {day.note_count > 0 && (
                      <span
                        title={`${day.note_count} margin ${day.note_count === 1 ? "note" : "notes"}`}
                        className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/15"
                      >
                        N
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs opacity-50">
            S session · R read · J journaled · N margin notes
            {user
              ? " — hover a day for the daily passage."
              : " — how your practice will appear here."}
          </p>
        </section>
      </div>

      {/* Right: the selected day's detail */}
      <div className="lg:border-l lg:border-black/10 lg:pl-8 dark:lg:border-white/15">
        {detail ? (
          <DayPanel detail={detail} />
        ) : user ? (
          <p className="pt-2 text-sm opacity-60">
            Select a day to see its passage and your practice.
          </p>
        ) : (
          <p className="pt-2 text-sm opacity-60">
            Each day here gathers the daily passage and your practice —
            sessions, passages read, journal entries, and margin notes.
            Signed in, selecting a day shows its record.
          </p>
        )}
      </div>
    </div>
  );
}
