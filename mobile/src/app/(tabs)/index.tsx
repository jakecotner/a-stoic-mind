import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { fetchDaily } from '@/lib/api';
import type { Source } from '@/lib/types';

export default function TodayScreen() {
  const [passage, setPassage] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const daily = await fetchDaily();
      if (daily) {
        setPassage(daily);
        setError(null);
      } else {
        setError('Could not load the daily passage.');
      }
    } catch {
      setError('Could not reach the server. Check API_BASE in src/lib/config.ts.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }>
          <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
            PASSAGE OF THE DAY
          </ThemedText>

          {passage && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText style={styles.passageText}>{passage.text}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {passage.author}, {passage.work} {passage.reference}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                trans. {passage.translator}
              </ThemedText>
            </ThemedView>
          )}

          {!passage && !error && (
            <ThemedText themeColor="textSecondary">Loading…</ThemedText>
          )}

          {error && <ThemedText themeColor="textSecondary">{error}</ThemedText>}
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
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  kicker: {
    letterSpacing: 1,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  passageText: {
    fontSize: 18,
    lineHeight: 28,
  },
});
