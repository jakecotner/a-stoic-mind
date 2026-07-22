import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MarkdownLite } from '@/components/markdown-lite';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { localDateISO, streamSynthesis } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Note, SynthesisMeta } from '@/lib/types';

/** Monday (local) of the week containing d. */
function mondayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

/** The Stoa's weekly synthesis (Stoa Plus) — mirrors the web Journal card.
    Peeks for a stored synthesis on load; generating is always an explicit
    tap. Hidden entirely on free accounts: mobile can't sell the plan (App
    Store rules), so it doesn't tease it either. */
export function WeekSynthesis({ notes }: { notes: Note[] }) {
  const { isPlus } = useAuth();
  const theme = useTheme();

  const thisMonday = mondayOf(new Date());
  const lastMonday = new Date(
    thisMonday.getFullYear(),
    thisMonday.getMonth(),
    thisMonday.getDate() - 7,
  );
  const countIn = (start: Date) => {
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return notes.filter((n) => {
      const t = new Date(n.created_at);
      return t >= start && t < end;
    }).length;
  };
  // A synthesis of one entry would just paraphrase it — wait for a real week.
  const week =
    countIn(thisMonday) >= 2 ? thisMonday : countIn(lastMonday) >= 2 ? lastMonday : null;
  const weekStart = week ? localDateISO(week) : null;
  const isCurrentWeek = week === thisMonday;

  const [content, setContent] = useState('');
  const [meta, setMeta] = useState<SynthesisMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);

  const run = useCallback(
    (mode: { peek?: boolean; refresh?: boolean }) => {
      if (!weekStart) return;
      const t = ++token.current;
      const fresh = () => token.current === t;
      setBusy(true);
      setError(null);
      setContent('');
      streamSynthesis(weekStart, mode, {
        onMeta: (m) => {
          if (fresh()) setMeta(m);
        },
        onDelta: (d) => {
          if (fresh()) setContent((c) => c + d);
        },
        onError: (e) => {
          if (fresh()) setError(e);
        },
        onDone: () => {
          if (fresh()) setBusy(false);
        },
      }).catch(() => {
        if (fresh()) setBusy(false);
      });
    },
    [weekStart],
  );

  // Deferred a tick: run() sets busy state, which must not happen
  // synchronously inside the effect body.
  useEffect(() => {
    if (!isPlus || !weekStart) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) run({ peek: true });
    });
    return () => {
      cancelled = true;
    };
  }, [isPlus, weekStart, run]);

  if (!isPlus || !weekStart) return null;

  const newEntries = meta ? meta.entry_count - meta.covered_count : 0;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {isCurrentWeek ? 'YOUR WEEK' : 'LAST WEEK'}
      </ThemedText>
      {content ? (
        <MarkdownLite>{content}</MarkdownLite>
      ) : busy ? (
        <View style={styles.thinking}>
          <ActivityIndicator size="small" color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Reading your week…
          </ThemedText>
        </View>
      ) : meta && !meta.exists ? (
        <Pressable onPress={() => run({})}>
          <ThemedText type="linkPrimary">
            Synthesize {isCurrentWeek ? 'your week so far' : 'last week'}
          </ThemedText>
        </Pressable>
      ) : null}
      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}
      {content !== '' && !busy && newEntries > 0 && (
        <Pressable onPress={() => run({ refresh: true })}>
          <ThemedText type="linkPrimary">
            Weave in {newEntries} newer {newEntries === 1 ? 'entry' : 'entries'}
          </ThemedText>
        </Pressable>
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
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  error: {
    color: '#d33',
  },
});
