import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarkdownLite } from '@/components/markdown-lite';
import { PlayButton } from '@/components/play-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchDaily, streamReflection, trackReads } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import type { Source } from '@/lib/types';

export default function TodayScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [passage, setPassage] = useState<Source | null>(null);
  const [reflection, setReflection] = useState('');
  const [reflectionError, setReflectionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Guards against a stale stream writing into a refreshed screen.
  const loadToken = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadToken.current;
    const fresh = () => loadToken.current === token;
    try {
      const daily = await fetchDaily();
      if (!fresh()) return;
      if (!daily) {
        setError('Could not load the daily passage.');
        return;
      }
      setPassage(daily);
      setError(null);
      setReflection('');
      setReflectionError(null);
      trackReads([daily.id]); // fire-and-forget; no-op when signed out
      streamReflection(daily.id, {
        onMeta: () => {},
        onDelta: (d) => {
          if (fresh()) setReflection((r) => r + d);
        },
        onError: (e) => {
          if (fresh()) setReflectionError(e);
        },
        onDone: () => {},
      }).catch(() => {
        if (fresh()) setReflectionError('The Stoa is unavailable right now.');
      });
    } catch {
      if (fresh()) setError('Could not reach the server.');
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
            TODAY'S PASSAGE
          </ThemedText>

          {passage && (
            <>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText style={styles.passageText}>{passage.text}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  — {passage.author}, {passage.work} {passage.reference}
                </ThemedText>
                <PlayButton src={`${API_BASE}/api/passages/${passage.id}/audio`} />
              </ThemedView>

              <Pressable
                style={[styles.reflectButton, { backgroundColor: theme.text }]}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/journal',
                    params: { seed: String(passage.id) },
                  })
                }>
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  Reflect on this
                </ThemedText>
              </Pressable>

              {reflection ? (
                <ThemedView type="backgroundElement" style={styles.breakdown}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
                    FROM THE STOA
                  </ThemedText>
                  <MarkdownLite>{reflection}</MarkdownLite>
                </ThemedView>
              ) : reflectionError ? null : (
                <ThemedText type="small" themeColor="textSecondary">
                  Reading today's passage…
                </ThemedText>
              )}
            </>
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
  reflectButton: {
    borderRadius: Spacing.two,
    paddingVertical: 12,
    alignItems: 'center',
  },
  breakdown: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
