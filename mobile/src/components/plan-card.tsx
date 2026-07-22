import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deletePlan, fetchPlan, localDateISO, savePlan } from '@/lib/api';
import {
  cancelReminders,
  reminderScheduled,
  scheduleDailyReminder,
} from '@/lib/reminders';
import type { PracticePlan } from '@/lib/types';

const TIMES = [
  { label: 'Morning', value: '06:30' },
  { label: 'Midday', value: '12:00' },
  { label: 'Evening', value: '21:00' },
];
const DURATIONS = [5, 15, 30];

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.text : theme.backgroundSelected,
        },
      ]}
      onPress={onPress}>
      <ThemedText
        type="small"
        style={{ color: selected ? theme.background : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** The last 14 days, oldest first: filled = practiced. */
function AdherenceStrip({ activeDates }: { activeDates: Set<string> }) {
  const theme = useTheme();
  const days: { date: string; active: boolean }[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 13);
  for (let i = 0; i < 14; i++) {
    const iso = localDateISO(d);
    days.push({ date: iso, active: activeDates.has(iso) });
    d.setDate(d.getDate() + 1);
  }
  return (
    <View style={styles.strip}>
      {days.map((day) => (
        <View
          key={day.date}
          style={[
            styles.stripDot,
            day.active
              ? { backgroundColor: theme.text }
              : { borderColor: theme.textSecondary, borderWidth: 1 },
          ]}
        />
      ))}
    </View>
  );
}

export function PlanCard({ activeDates }: { activeDates: Set<string> }) {
  const theme = useTheme();
  // undefined = loading; null = no plan yet.
  const [plan, setPlan] = useState<PracticePlan | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState('06:30');
  const [duration, setDuration] = useState(15);
  const [busy, setBusy] = useState(false);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderHint, setReminderHint] = useState<string | null>(null);

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
    reminderScheduled().then(setReminderOn);
  }, []);

  async function commit() {
    if (busy) return;
    setBusy(true);
    try {
      const saved = await savePlan(time, duration);
      setPlan(saved);
      setEditing(false);
      if (reminderOn) await scheduleDailyReminder(saved.reminder_time);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await deletePlan();
      await cancelReminders();
      setPlan(null);
      setReminderOn(false);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function toggleReminder(on: boolean) {
    setReminderHint(null);
    if (!plan) return;
    if (on) {
      const ok = await scheduleDailyReminder(plan.reminder_time);
      setReminderOn(ok);
      if (!ok) {
        setReminderHint(
          'Reminders need notification permission — and the next app build if this one predates it.',
        );
      }
    } else {
      await cancelReminders();
      setReminderOn(false);
    }
  }

  if (plan === undefined) return null;

  // Adherence over the last 30 days.
  const d = new Date();
  let practiced = 0;
  for (let i = 0; i < 30; i++) {
    if (activeDates.has(localDateISO(d))) practiced += 1;
    d.setDate(d.getDate() - 1);
  }

  if (!plan || editing) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">
          {plan ? 'Adjust your intention' : 'Set an intention'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          A small promise, kept daily, outweighs a grand one abandoned.
        </ThemedText>
        <View style={styles.chipRow}>
          {TIMES.map((t) => (
            <Chip
              key={t.value}
              label={`${t.label} ${t.value}`}
              selected={time === t.value}
              onPress={() => setTime(t.value)}
            />
          ))}
        </View>
        <View style={styles.chipRow}>
          {DURATIONS.map((m) => (
            <Chip
              key={m}
              label={`${m} min`}
              selected={duration === m}
              onPress={() => setDuration(m)}
            />
          ))}
        </View>
        <View style={styles.actionRow}>
          <Pressable
            style={[
              styles.commitButton,
              { backgroundColor: theme.text },
              busy && styles.disabled,
            ]}
            onPress={commit}
            disabled={busy}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {plan ? 'Save' : 'Set intention'}
            </ThemedText>
          </Pressable>
          {editing && (
            <Pressable onPress={() => setEditing(false)}>
              <ThemedText type="small" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          )}
          {plan && editing && (
            <Pressable onPress={remove} disabled={busy}>
              <ThemedText type="small" style={styles.deleteText}>
                Remove intention
              </ThemedText>
            </Pressable>
          )}
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.planHead}>
        <ThemedText type="smallBold">
          {plan.duration_minutes} min at {plan.reminder_time}, daily
        </ThemedText>
        <Pressable onPress={() => setEditing(true)}>
          <ThemedText type="small" themeColor="textSecondary">
            Edit
          </ThemedText>
        </Pressable>
      </View>

      <AdherenceStrip activeDates={activeDates} />
      <ThemedText type="small" themeColor="textSecondary">
        {practiced} of the last 30 days
      </ThemedText>

      <View style={styles.reminderRow}>
        <ThemedText type="small">Daily reminder</ThemedText>
        <Switch value={reminderOn} onValueChange={toggleReminder} />
      </View>
      {reminderHint && (
        <ThemedText type="small" themeColor="textSecondary">
          {reminderHint}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  chip: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  commitButton: {
    borderRadius: Spacing.two,
    paddingVertical: 10,
    paddingHorizontal: Spacing.four,
  },
  disabled: {
    opacity: 0.4,
  },
  deleteText: {
    color: '#d33',
  },
  planHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  strip: {
    flexDirection: 'row',
    gap: 5,
  },
  stripDot: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  reminderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
