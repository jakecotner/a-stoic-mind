import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanCard } from '@/components/plan-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchCalendarDay, fetchCalendarMonth, localDateISO } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { CalendarDay, DayDetail } from '@/lib/types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

export default function CalendarScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const today = localDateISO();
  const now = new Date();
  const [cursor, setCursor] = useState<[number, number]>([
    now.getFullYear(),
    now.getMonth() + 1,
  ]);
  // All loaded months' activity, keyed "year-month".
  const [months, setMonths] = useState<Record<string, CalendarDay[]>>({});
  const [selected, setSelected] = useState<string | null>(today);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMonth = useCallback(
    async (y: number, m: number) => {
      try {
        const data = await fetchCalendarMonth(y, m);
        setMonths((prev) => ({ ...prev, [monthKey(y, m)]: data.days }));
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  // Current + previous month on mount: enough for the streak in almost all
  // cases, and the streak only undercounts (never lies high) beyond that.
  useEffect(() => {
    if (!user) return;
    const [y, m] = [now.getFullYear(), now.getMonth() + 1];
    loadMonth(y, m);
    const [py, pm] = shiftMonth(y, m, -1);
    loadMonth(py, pm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadMonth]);

  useEffect(() => {
    if (!user) return;
    const [y, m] = cursor;
    if (!months[monthKey(y, m)]) loadMonth(y, m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cursor, loadMonth]);

  useEffect(() => {
    if (!user || !selected) {
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

  if (user === null) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle">Practice</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          Sign in to see your practice calendar — what you read and wrote, day
          by day.
        </ThemedText>
        <Link href="/sign-in" asChild>
          <Pressable
            style={StyleSheet.flatten([
              styles.primaryButton,
              { backgroundColor: theme.text },
            ])}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              Sign in
            </ThemedText>
          </Pressable>
        </Link>
      </ThemedView>
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Practice</ThemedText>
            {streak > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {streak} day{streak === 1 ? '' : 's'} in a row
              </ThemedText>
            )}
          </View>

          <PlanCard activeDates={activeDates} />

          <View style={styles.monthNav}>
            <Pressable
              hitSlop={12}
              onPress={() => setCursor(([y, m]) => shiftMonth(y, m, -1))}>
              <ThemedText type="subtitle">‹</ThemedText>
            </Pressable>
            <ThemedText type="smallBold">
              {MONTHS[month - 1]} {year}
            </ThemedText>
            <Pressable
              hitSlop={12}
              onPress={() => setCursor(([y, m]) => shiftMonth(y, m, 1))}>
              <ThemedText type="subtitle">›</ThemedText>
            </Pressable>
          </View>

          <View style={styles.week}>
            {WEEKDAYS.map((w, i) => (
              <ThemedText
                key={i}
                type="small"
                themeColor="textSecondary"
                style={styles.weekday}>
                {w}
              </ThemedText>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((dateISO, i) => {
              if (!dateISO) return <View key={i} style={styles.cell} />;
              const activity = dayMap[dateISO];
              const isSelected = dateISO === selected;
              const isToday = dateISO === today;
              return (
                <Pressable
                  key={i}
                  style={styles.cell}
                  onPress={() => setSelected(dateISO)}>
                  <View
                    style={[
                      styles.dayCircle,
                      isToday && { borderColor: theme.textSecondary, borderWidth: 1 },
                      isSelected && { backgroundColor: theme.backgroundSelected },
                    ]}>
                    <ThemedText type="small">
                      {Number(dateISO.slice(-2))}
                    </ThemedText>
                    <View style={styles.dots}>
                      {activity && activity.entries > 0 && (
                        <View style={[styles.dot, { backgroundColor: theme.text }]} />
                      )}
                      {activity && activity.passages_read > 0 && (
                        <View
                          style={[styles.dot, { backgroundColor: theme.textSecondary }]}
                        />
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            <View style={[styles.dot, { backgroundColor: theme.text }]} />
            <ThemedText type="small" themeColor="textSecondary">
              wrote
            </ThemedText>
            <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
            <ThemedText type="small" themeColor="textSecondary">
              read
            </ThemedText>
          </View>

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}

          {selected && (
            <View style={styles.detail}>
              <ThemedText type="smallBold">
                {new Date(selected + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </ThemedText>

              {detailLoading && (
                <ThemedText type="small" themeColor="textSecondary">
                  Loading…
                </ThemedText>
              )}

              {detail && !detailLoading && (
                <>
                  {detail.daily_passage && (
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <ThemedText type="small" themeColor="textSecondary">
                        DAILY PASSAGE
                      </ThemedText>
                      <ThemedText type="small">
                        {detail.daily_passage.text.length > 200
                          ? detail.daily_passage.text.slice(0, 200) + '…'
                          : detail.daily_passage.text}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        — {detail.daily_passage.author},{' '}
                        {detail.daily_passage.reference}
                      </ThemedText>
                    </ThemedView>
                  )}

                  {detail.passages_read.length > 0 && (
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <ThemedText type="small" themeColor="textSecondary">
                        READ
                      </ThemedText>
                      {detail.passages_read.map((p) => (
                        <ThemedText key={p.id} type="small">
                          {p.author}, {p.reference}
                        </ThemedText>
                      ))}
                    </ThemedView>
                  )}

                  {detail.notes.length > 0 && (
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <ThemedText type="small" themeColor="textSecondary">
                        WRITTEN
                      </ThemedText>
                      {detail.notes.map((n) => (
                        <View key={n.id} style={styles.noteRow}>
                          {n.passage && (
                            <ThemedText type="small" themeColor="textSecondary">
                              on {n.passage.reference}
                            </ThemedText>
                          )}
                          <ThemedText type="small">
                            {n.content.length > 240
                              ? n.content.slice(0, 240) + '…'
                              : n.content}
                          </ThemedText>
                        </View>
                      ))}
                    </ThemedView>
                  )}

                  {detail.notes.length === 0 &&
                    detail.passages_read.length === 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        No practice recorded this day.
                      </ThemedText>
                    )}
                </>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centerText: {
    textAlign: 'center',
  },
  primaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: 12,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
  },
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayCircle: {
    width: 40,
    height: 44,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  detail: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  noteRow: {
    gap: 2,
  },
  error: {
    color: '#d33',
  },
});
