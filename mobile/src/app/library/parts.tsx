// A work's table of contents. Works read whole (a single unnamed part) skip
// straight to the reader, like the web.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InlineAction, LoadingScreen, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { fetchToc, type TocPart } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';

export default function PartsScreen() {
  const theme = useTheme();
  const { work, author, translator } = useLocalSearchParams<{
    work: string;
    author: string;
    translator: string;
  }>();
  const [toc, setToc] = useState<TocPart[] | undefined>(undefined);

  useEffect(() => {
    if (work) fetchToc(work).then(setToc);
  }, [work]);

  const openReader = (part: string, label: string | null) =>
    router.push({
      pathname: '/library/reader',
      params: { work, author, translator, part, label: label ?? '' },
    });

  // Works read whole go straight to the text.
  useEffect(() => {
    if (toc && toc.length === 1 && toc[0].part === '') {
      router.replace({
        pathname: '/library/reader',
        params: { work, author, translator, part: '', label: '' },
      });
    }
  }, [toc, work, author, translator]);

  if (!toc) return <LoadingScreen title={work ?? 'Library'} />;

  return (
    <Screen title={work ?? ''}>
      <View style={styles.headerBlock}>
        <InlineAction label="← Library" onPress={() => router.back()} />
        <ThemedText type="small" themeColor="textSecondary">
          {author} · translated by {translator}
        </ThemedText>
      </View>
      <View style={styles.list}>
        {toc.map((entry) => (
          <Pressable
            key={entry.part}
            onPress={() => openReader(entry.part, entry.label)}
            style={({ pressed }) => [
              styles.partRow,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText type="small" style={styles.partLabel}>
              {entry.label}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {entry.passage_count}p
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    gap: Spacing.one,
  },
  list: {
    gap: Spacing.two,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  partLabel: {
    flexShrink: 1,
  },
});
