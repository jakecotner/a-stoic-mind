import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * Minimal markdown renderer for the Stoa's replies (react-markdown is
 * DOM-only). Handles what the model actually emits: paragraphs, #/## headers,
 * "-"/"*" bullet lists, and **bold** / *italic* inline runs. Anything fancier
 * degrades to plain text.
 */

function InlineRuns({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={i} style={styles.bold}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return (
            <Text key={i} style={styles.italic}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </>
  );
}

export function MarkdownLite({ children }: { children: string }) {
  const blocks = children.split(/\n{2,}/).filter((b) => b.trim());
  return (
    <View style={styles.container}>
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim());
        const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));
        if (isList) {
          return (
            <View key={i} style={styles.list}>
              {lines.map((l, j) => (
                <View key={j} style={styles.listItem}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {'•'}
                  </ThemedText>
                  <ThemedText type="small" style={styles.listText}>
                    <InlineRuns text={l.replace(/^\s*[-*]\s+/, '')} />
                  </ThemedText>
                </View>
              ))}
            </View>
          );
        }
        const header = block.match(/^(#{1,4})\s+(.*)$/s);
        if (header) {
          return (
            <ThemedText key={i} type="smallBold">
              <InlineRuns text={header[2].trim()} />
            </ThemedText>
          );
        }
        return (
          <ThemedText key={i} type="small">
            <InlineRuns text={block.replace(/\n/g, ' ')} />
          </ThemedText>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.one,
  },
  listItem: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingRight: Spacing.three,
  },
  listText: {
    flex: 1,
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
});
