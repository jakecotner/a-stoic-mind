// Today — the app's first tab, mirroring the web landing page: today's
// passage with narration, and the day's reflection beneath it. The journal
// pad lives on its own tab (Journal).
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { BoldMarkdown } from '@/components/bold-markdown';
import { PlayButton } from '@/components/play-button';
import { ThemedText } from '@/components/themed-text';
import { EmptyState, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  breakdownAudioUrl,
  fetchBreakdown,
  fetchDaily,
  passageAudioUrl,
  type Daily,
} from '@/lib/api';
import { type QueueItem } from '@/lib/narration';
import { type ContinueMode } from '@/lib/prefs';

/** The day's narration queue: the passage, then — when the listener's
    continue mode says so — its reflection. */
function dayQueue(passageId: string, reference: string) {
  return (mode: ContinueMode): QueueItem[] => {
    const items: QueueItem[] = [
      { src: passageAudioUrl(passageId), passageId, kind: 'passage', title: reference },
    ];
    if (mode === 'reflections')
      items.push({
        src: breakdownAudioUrl(passageId),
        passageId,
        kind: 'breakdown',
        title: `Reflection — ${reference}`,
        prepare: async () => {
          const b = await fetchBreakdown(passageId);
          return !!b?.breakdown;
        },
      });
    return items;
  };
}

export default function TodayScreen() {
  const [daily, setDaily] = useState<Daily | null | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setDaily(await fetchDaily());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return (
    <Screen
      title="Today"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {daily === undefined ? null : daily === null ? (
        <EmptyState
          message="Today's passage is unavailable right now."
          hint="Pull to refresh in a moment — the server may be waking up."
        />
      ) : (
        <>
          <SectionTitle>Today&apos;s passage</SectionTitle>
          <View style={styles.referenceRow}>
            <ThemedText style={styles.reference}>{daily.passage.reference}</ThemedText>
            <PlayButton
              src={passageAudioUrl(daily.passage.id)}
              queueFrom={dayQueue(daily.passage.id, daily.passage.reference)}
            />
          </View>
          <ThemedText style={styles.passage}>{daily.passage.text}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {daily.passage.author}, {daily.passage.work} · translated by{' '}
            {daily.passage.translator}
          </ThemedText>

          <View style={styles.reflection}>
            <View style={styles.referenceRow}>
              <SectionTitle>Reflection</SectionTitle>
              {daily.breakdown ? (
                <PlayButton src={breakdownAudioUrl(daily.passage.id)} />
              ) : null}
            </View>
            {daily.breakdown ? (
              <BoldMarkdown text={daily.breakdown} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Today&apos;s reflection isn&apos;t available right now — the passage stands on
                its own.
              </ThemedText>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  reference: {
    fontWeight: 600,
  },
  passage: {
    fontSize: 18,
    lineHeight: 28,
  },
  reflection: {
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
});
