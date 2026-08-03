// LLM output (breakdowns, reflections) arrives as light markdown — bold
// **headings**, paragraph breaks. Render it as paragraphs with bold spans;
// no markdown library for two markers (mirrors the web's BoldMarkdown).
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function BoldMarkdown({ text }: { text: string }) {
  return (
    <View style={styles.stack}>
      {text.split(/\n{2,}/).map((para, i) => (
        <ThemedText key={i} type="small" style={styles.para}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? (
              <ThemedText key={j} type="smallBold">
                {part.slice(2, -2)}
              </ThemedText>
            ) : (
              part
            )
          )}
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.two,
  },
  para: {
    opacity: 0.9,
  },
});
