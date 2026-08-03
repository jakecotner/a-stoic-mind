// Practice — the month at a glance with the standing intention above it,
// and the selected day's record beneath (the shared daily passage plus your
// own journaling, margin notes, and reading), mirroring the web page.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, InlineAction, Screen, SectionTitle, Stepper } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  fetchCalendar,
  fetchDayDetail,
  fetchIntention,
  saveIntention,
  type CalendarDay,
  type DayDetail,
  type Intention,
} from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "06:30:00" -> "6:30am" */
function formatTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)}${h >= 12 ? 'pm' : 'am'}`;
}

function IntentionBar() {
  const theme = useTheme();
  const [intention, setIntention] = useState<Intention | null>(null);
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState(15);
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIntention().then((i) => {
      setIntention(i);
      if (i) {
        setMinutes(i.minutes_per_day);
        setTime(i.time_of_day ? i.time_of_day.slice(0, 5) : '');
      }
    });
  }, []);

  if (editing || intention === null) {
    return (
      <Card style={styles.intentionCard}>
        <ThemedText type="smallBold">My intention</ThemedText>
        <View style={styles.intentionRow}>
          <Stepper value={minutes} onChange={setMinutes} min={5} step={5} />
          <ThemedText type="small">minutes a day</ThemedText>
        </View>
        <View style={styles.intentionRow}>
          <ThemedText type="small">at</ThemedText>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="06:30"
            placeholderTextColor={theme.textSecondary}
            style={[styles.timeInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            (optional)
          </ThemedText>
        </View>
        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}
        <View style={styles.intentionActions}>
          <View style={styles.flexOne}>
            <Button
              label="Save"
              busy={busy}
              onPress={async () => {
                const t = time.trim();
                if (t && !/^\d{1,2}:\d{2}$/.test(t)) {
                  setError('Time looks off — use HH:MM, like 06:30.');
                  return;
                }
                setBusy(true);
                setError(null);
                try {
                  setIntention(await saveIntention(minutes, t || null));
                  setEditing(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not save');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
          {intention !== null && (
            <View style={styles.flexOne}>
              <Button label="Cancel" kind="secondary" onPress={() => setEditing(false)} />
            </View>
          )}
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.intentionCard}>
      <View style={styles.intentionSummaryRow}>
        <ThemedText type="small">
          <ThemedText type="smallBold">My intention: </ThemedText>
          {intention.minutes_per_day} minutes a day
          {intention.time_of_day ? ` at ${formatTime(intention.time_of_day)}` : ''}
        </ThemedText>
        <InlineAction label="Edit" onPress={() => setEditing(true)} />
      </View>
    </Card>
  );
}

function DayPanel({ detail }: { detail: DayDetail }) {
  const empty =
    detail.journal.length === 0 && detail.notes.length === 0 && detail.reads.length === 0;

  return (
    <View style={styles.dayPanel}>
      {detail.daily && (
        <View style={styles.daySection}>
          <SectionTitle>Daily passage</SectionTitle>
          <ThemedText type="smallBold">{detail.daily.reference}</ThemedText>
          <ThemedText type="small" style={styles.dim}>
            {detail.daily.text}
          </ThemedText>
        </View>
      )}

      {detail.reads.length > 0 && (
        <View style={styles.daySection}>
          <SectionTitle>Read</SectionTitle>
          {detail.reads.map((r) => (
            <ThemedText type="small" key={r.work}>
              {r.work}{' '}
              <ThemedText type="small" themeColor="textSecondary">
                ({r.author}) — {r.passage_count} passages
              </ThemedText>
            </ThemedText>
          ))}
        </View>
      )}

      {detail.journal.length > 0 && (
        <View style={styles.daySection}>
          <SectionTitle>Journal</SectionTitle>
          {detail.journal.map((e) => (
            <Card key={e.id} style={styles.dayCard}>
              <ThemedText type="small">{e.content}</ThemedText>
            </Card>
          ))}
        </View>
      )}

      {detail.notes.length > 0 && (
        <View style={styles.daySection}>
          <SectionTitle>Margin notes</SectionTitle>
          {detail.notes.map((n) => (
            <Card key={n.id} style={styles.dayCard}>
              {n.passage_reference && (
                <ThemedText type="small" themeColor="textSecondary">
                  {n.passage_reference}
                </ThemedText>
              )}
              <ThemedText type="small">{n.content}</ThemedText>
            </Card>
          ))}
        </View>
      )}

      {empty && (
        <ThemedText type="small" themeColor="textSecondary">
          Nothing recorded this day — the practice continues tomorrow.
        </ThemedText>
      )}
    </View>
  );
}

export default function PracticeScreen() {
  const theme = useTheme();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [selected, setSelected] = useState<string>(todayStr);
  const [detail, setDetail] = useState<DayDetail | null>(null);

  useEffect(() => {
    fetchCalendar(view.year, view.month).then(setDays);
  }, [view]);

  useEffect(() => {
    setDetail(null);
    fetchDayDetail(selected).then(setDetail);
  }, [selected]);

  const shift = useCallback((delta: number) => {
    setView((v) => {
      const idx = v.year * 12 + (v.month - 1) + delta;
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    });
  }, []);

  const firstWeekday = new Date(view.year, view.month - 1, 1).getDay();

  return (
    <Screen title="Practice">
      <IntentionBar />

      <View style={styles.monthHeader}>
        <InlineAction label="← previous" onPress={() => shift(-1)} />
        <ThemedText type="smallBold">
          {MONTHS[view.month - 1]} {view.year}
        </ThemedText>
        <InlineAction label="next →" onPress={() => shift(1)} />
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map((d, i) => (
          <View key={`${d}-${i}`} style={styles.cell}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {d}
            </ThemedText>
          </View>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <View key={`blank-${i}`} style={styles.cell} />
        ))}
        {days.map((day) => {
          const n = Number(day.date.slice(-2));
          const isSelected = day.date === selected;
          const isToday = day.date === todayStr;
          return (
            <View key={day.date} style={styles.cell}>
              <Pressable
                onPress={() => setSelected(day.date)}
                style={[
                  styles.dayButton,
                  { backgroundColor: isSelected ? theme.backgroundSelected : theme.backgroundElement },
                ]}>
                <ThemedText type="small" style={isToday && styles.today}>
                  {n}
                </ThemedText>
                <View style={styles.badges}>
                  {day.read_count > 0 && <Dot label="R" />}
                  {day.journal_count > 0 && <Dot label="J" />}
                  {day.note_count > 0 && <Dot label="N" />}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        R read · J journaled · N margin notes
      </ThemedText>

      {detail && <DayPanel detail={detail} />}
    </Screen>
  );
}

function Dot({ label }: { label: string }) {
  return (
    <ThemedText themeColor="textSecondary" style={styles.dot}>
      {label}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  intentionCard: {
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  intentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  intentionSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  intentionActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flexOne: {
    flex: 1,
  },
  timeInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    minWidth: 72,
    fontSize: 14,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    padding: 2,
  },
  dayButton: {
    borderRadius: Spacing.two,
    minHeight: 52,
    padding: Spacing.one,
    alignItems: 'flex-start',
  },
  center: {
    textAlign: 'center',
    width: '100%',
  },
  today: {
    textDecorationLine: 'underline',
    fontWeight: 700,
  },
  badges: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 'auto',
  },
  dot: {
    fontSize: 9,
    lineHeight: 12,
  },
  dayPanel: {
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  daySection: {
    gap: Spacing.one,
  },
  dayCard: {
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  dim: {
    opacity: 0.9,
  },
  error: {
    color: '#c94040',
  },
});
