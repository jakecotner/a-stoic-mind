// The library — the works grouped by author, mirroring the web page.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { EmptyState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { fetchWorks, type Work } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';

export default function LibraryScreen() {
  const theme = useTheme();
  const [works, setWorks] = useState<Work[] | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setWorks(await fetchWorks());
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

  const authors = [...new Set((works ?? []).map((w) => w.author))];

  return (
    <Screen
      title="Library"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {works === undefined ? null : works.length === 0 ? (
        <EmptyState
          message="The library is unavailable right now."
          hint="Pull to refresh in a moment."
        />
      ) : (
        authors.map((author) => (
          <View key={author} style={styles.section}>
            <ThemedText type="smallBold">{author}</ThemedText>
            {works
              .filter((w) => w.author === author)
              .map((w) => (
                <Pressable
                  key={w.work}
                  onPress={() =>
                    router.push({
                      pathname: '/library/parts',
                      params: { work: w.work, author: w.author, translator: w.translator },
                    })
                  }
                  style={({ pressed }) => [
                    styles.workRow,
                    { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText type="small" style={styles.workName}>
                    {w.work}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {w.passage_count} passages
                  </ThemedText>
                </Pressable>
              ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  workRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  workName: {
    flexShrink: 1,
    fontWeight: 600,
  },
});
