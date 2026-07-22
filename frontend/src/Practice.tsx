import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deletePlan,
  fetchCalendarDay,
  fetchCalendarMonth,
  fetchPlan,
  localDateISO,
  savePlan,
  type AuthUser,
} from "./api";
import type { CalendarDay, DayDetail, PracticePlan } from "./types";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const TIMES = [
  { label: "Morning", value: "06:30" },
  { label: "Midday", value: "12:00" },
  { label: "Evening", value: "21:00" },
];
const DURATIONS = [5, 15, 30];

const monthKey = (y: number, m: number) => `${y}-${m}`;

function shiftMonth(y: number, m: number, delta: -1 | 1): [number, number] {
  const next = m + delta;
  if (next < 1) return [y - 1, 12];
  if (next > 12) return [y + 1, 1];
  return [y, next];
}

/** Consecutive active days ending today (or yesterday — an unfinished today
    shouldn't read as a broken streak). Walks only loaded months. */
function computeStreak(active: Set<string>): number {
  const day = new Date();
  if (!active.has(localDateISO(day))) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (active.has(localDateISO(day))) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={selected ? "chip chip-selected" : "chip"}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** The last 14 days, oldest first: filled = practiced. */
function AdherenceStrip({ activeDates }: { activeDates: Set<string> }) {
  const days: { date: string; active: boolean }[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 13);
  for (let i = 0; i < 14; i++) {
    const iso = localDateISO(d);
    days.push({ date: iso, active: activeDates.has(iso) });
    d.setDate(d.getDate() + 1);
  }
  return (
    <div className="plan-strip" aria-label="Last 14 days">
      {days.map((day) => (
        <span
          key={day.date}
          title={day.date}
          className={day.active ? "strip-dot strip-filled" : "strip-dot"}
        />
      ))}
    </div>
  );
}

function PlanCard({ activeDates }: { activeDates: Set<string> }) {
  // undefined = loading; null = no plan yet.
  const [plan, setPlan] = useState<PracticePlan | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState("06:30");
  const [duration, setDuration] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlan()
      .then((p) => {
        setPlan(p);
        if (p) {
          setTime(p.reminder_time);
          setDuration(p.duration_minutes);
        }
      })
      .catch(() => setPlan(null));
  }, []);

  async function commit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setPlan(await savePlan(time, duration));
      setEditing(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deletePlan();
      setPlan(null);
      setEditing(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (plan === undefined) return null;

  // Adherence over the last 30 days.
  let practiced = 0;
  const d = new Date();
  for (let i = 0; i < 30; i++) {
    if (activeDates.has(localDateISO(d))) practiced += 1;
    d.setDate(d.getDate() - 1);
  }

  if (!plan || editing) {
    return (
      <section className="plan-card">
        <div className="plan-head">
          <strong>{plan ? "Adjust your practice" : "Commit to a practice"}</strong>
        </div>
        <p className="plan-tagline">
          A small promise, kept daily, outweighs a grand one abandoned.
        </p>
        <div className="chip-row">
          {TIMES.map((t) => (
            <Chip
              key={t.value}
              label={`${t.label} ${t.value}`}
              selected={time === t.value}
              onClick={() => setTime(t.value)}
            />
          ))}
          <input
            type="time"
            className="plan-time"
            aria-label="Custom time"
            value={time}
            onChange={(e) => e.target.value && setTime(e.target.value)}
          />
        </div>
        <div className="chip-row">
          {DURATIONS.map((m) => (
            <Chip
              key={m}
              label={`${m} min`}
              selected={duration === m}
              onClick={() => setDuration(m)}
            />
          ))}
        </div>
        <div className="plan-actions">
          <button className="plan-commit" onClick={commit} disabled={busy}>
            {plan ? "Save" : "Commit"}
          </button>
          {editing && (
            <button className="auth-link" onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
          {plan && editing && (
            <button className="auth-link plan-remove" onClick={remove} disabled={busy}>
              Remove plan
            </button>
          )}
        </div>
        {error && <p className="msg-error">{error}</p>}
      </section>
    );
  }

  return (
    <section className="plan-card">
      <div className="plan-head">
        <strong>
          {plan.duration_minutes} min at {plan.reminder_time}, daily
        </strong>
        <button className="auth-link" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
      <AdherenceStrip activeDates={activeDates} />
      <p className="plan-meta">{practiced} of the last 30 days</p>
      {error && <p className="msg-error">{error}</p>}
    </section>
  );
}

function DayDetailPanel({
  date,
  detail,
  loading,
  onOpenPassage,
  onOpenNote,
}: {
  date: string;
  detail: DayDetail | null;
  loading: boolean;
  onOpenPassage: (passageId: number) => void;
  onOpenNote: (id: string) => void;
}) {
  const title = new Date(date + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <div className="day-detail">
      <h3 className="day-title">{title}</h3>
      {loading && <p className="thinking">Loading&hellip;</p>}
      {detail && !loading && (
        <>
          {detail.daily_passage && (
            <div className="day-card">
              <div className="pane-caption">Daily passage</div>
              <p className="day-passage-text">
                {detail.daily_passage.text.length > 280
                  ? detail.daily_passage.text.slice(0, 280).trimEnd() + "…"
                  : detail.daily_passage.text}
              </p>
              <div className="day-passage-cite">
                — {detail.daily_passage.author}, {detail.daily_passage.reference}
                {"  "}
                <button
                  className="auth-link"
                  onClick={() => onOpenPassage(detail.daily_passage!.id)}
                >
                  Read in context →
                </button>
              </div>
            </div>
          )}

          {detail.passages_read.length > 0 && (
            <div className="day-card">
              <div className="pane-caption">Read</div>
              <ul className="day-list">
                {detail.passages_read.map((p) => (
                  <li key={p.id}>
                    <button
                      className="auth-link"
                      onClick={() => onOpenPassage(p.id)}
                    >
                      {p.author}, {p.reference}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.notes.length > 0 && (
            <div className="day-card">
              <div className="pane-caption">Written</div>
              {detail.notes.map((n) => (
                <div key={n.id} className="day-note">
                  {n.passage && (
                    <div className="day-note-ref">on {n.passage.reference}</div>
                  )}
                  <p className="day-note-text">
                    {n.content.length > 240
                      ? n.content.slice(0, 240).trimEnd() + "…"
                      : n.content}
                  </p>
                  <button className="auth-link" onClick={() => onOpenNote(n.id)}>
                    Open in journal →
                  </button>
                </div>
              ))}
            </div>
          )}

          {detail.notes.length === 0 && detail.passages_read.length === 0 && (
            <p className="day-empty">
              {date === localDateISO()
                ? "Nothing yet today — the day isn't over."
                : "No practice recorded this day."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function Practice({
  user,
  onOpenPassage,
  onOpenNote,
  onSignIn,
}: {
  user: AuthUser | null;
  onOpenPassage: (passageId: number) => void;
  onOpenNote: (id: string) => void;
  onSignIn: () => void;
}) {
  const today = localDateISO();
  const now = new Date();
  const [cursor, setCursor] = useState<[number, number]>([
    now.getFullYear(),
    now.getMonth() + 1,
  ]);
  // All loaded months' activity, keyed "year-month".
  const [months, setMonths] = useState<Record<string, CalendarDay[]>>({});
  const [selected, setSelected] = useState<string>(today);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Months already fetched (or in flight): fetch each at most once.
  const requested = useRef(new Set<string>());

  const ensureMonth = useCallback(async (y: number, m: number) => {
    const key = monthKey(y, m);
    if (requested.current.has(key)) return;
    requested.current.add(key);
    try {
      const data = await fetchCalendarMonth(y, m);
      setMonths((prev) => ({ ...prev, [key]: data.days }));
    } catch (e) {
      requested.current.delete(key); // allow a retry on next visit
      setError(String(e));
    }
  }, []);

  // Reset per account, then load current + previous month: enough for the
  // streak in almost all cases, and the streak only undercounts (never lies
  // high) beyond that.
  useEffect(() => {
    requested.current = new Set();
    setMonths({});
    if (!user) return;
    const d = new Date();
    const [y, m] = [d.getFullYear(), d.getMonth() + 1];
    ensureMonth(y, m);
    const [py, pm] = shiftMonth(y, m, -1);
    ensureMonth(py, pm);
  }, [user, ensureMonth]);

  // Paging to a month not yet seen fetches it once; the cache persists.
  useEffect(() => {
    if (!user) return;
    ensureMonth(cursor[0], cursor[1]);
  }, [user, cursor, ensureMonth]);

  useEffect(() => {
    if (!user) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchCalendarDay(selected)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, selected]);

  const dayMap = useMemo(() => {
    const map: Record<string, CalendarDay> = {};
    for (const days of Object.values(months)) {
      for (const d of days) map[d.date] = d;
    }
    return map;
  }, [months]);

  const activeDates = useMemo(
    () =>
      new Set(
        Object.values(dayMap)
          .filter((d) => d.entries > 0 || d.passages_read > 0)
          .map((d) => d.date),
      ),
    [dayMap],
  );

  const streak = useMemo(() => computeStreak(activeDates), [activeDates]);

  if (!user) {
    return (
      <div className="practice">
        <h2 className="view-title">Practice</h2>
        <p className="intro">
          <button className="auth-link" onClick={onSignIn}>
            Sign in
          </button>{" "}
          to see your practice calendar — what you read and wrote, day by day.
        </p>
      </div>
    );
  }

  const [year, month] = cursor;
  // Grid cells: leading blanks for the first weekday, then the month's days.
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      localDateISO(new Date(year, month - 1, i + 1)),
    ),
  ];
  const monthTitle = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="practice">
      <h2 className="view-title">Practice</h2>
      {streak > 0 && (
        <p className="practice-streak">
          {streak} day{streak === 1 ? "" : "s"} in a row
        </p>
      )}

      <div className="practice-split">
        <section className="practice-cal" aria-label="Practice calendar">
          <PlanCard activeDates={activeDates} />

          <div className="cal-nav">
            <button
              aria-label="Previous month"
              onClick={() => setCursor(([y, m]) => shiftMonth(y, m, -1))}
            >
              ‹
            </button>
            <span className="cal-title">{monthTitle}</span>
            <button
              aria-label="Next month"
              onClick={() => setCursor(([y, m]) => shiftMonth(y, m, 1))}
            >
              ›
            </button>
          </div>

          <div className="cal-week">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="cal-weekday">
                {w}
              </span>
            ))}
          </div>

          <div className="cal-grid">
            {cells.map((dateISO, i) => {
              if (!dateISO) return <span key={i} />;
              const activity = dayMap[dateISO];
              const classes = ["cal-cell"];
              if (dateISO === today) classes.push("cal-today");
              if (dateISO === selected) classes.push("cal-selected");
              return (
                <button
                  key={i}
                  className={classes.join(" ")}
                  onClick={() => setSelected(dateISO)}
                >
                  <span className="cal-daynum">{Number(dateISO.slice(-2))}</span>
                  <span className="cal-dots">
                    {activity && activity.entries > 0 && (
                      <span className="cal-dot dot-wrote" />
                    )}
                    {activity && activity.passages_read > 0 && (
                      <span className="cal-dot dot-read" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="cal-legend">
            <span className="cal-dot dot-wrote" /> wrote
            <span className="cal-dot dot-read" /> read
          </div>

          {error && <p className="msg-error">{error}</p>}
        </section>

        <section className="practice-detail" aria-label="Day detail">
          <DayDetailPanel
            date={selected}
            detail={detail}
            loading={detailLoading}
            onOpenPassage={onOpenPassage}
            onOpenNote={onOpenNote}
          />
        </section>
      </div>
    </div>
  );
}
