// Shared UI building blocks for the app's screens. Everything themes off
// constants/theme.ts the same way the template components do.
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The app's accent color. The web frontend is monochrome; a muted bronze
 * keeps the same restraint while giving buttons a readable fill. */
export const Accent = '#8c6d3f';

/** Full-height screen with safe area, title row, and scrollable content. */
export function Screen({
  title,
  right,
  children,
  scroll = true,
  refreshControl,
}: {
  title: string;
  /** Optional control rendered at the right end of the title row. */
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const body = (
    <>
      <View style={styles.titleRow}>
        <ThemedText type="subtitle">{title}</ThemedText>
        {right}
      </View>
      {children}
    </>
  );
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={refreshControl}>
            {body}
          </ScrollView>
        ) : (
          <View style={[styles.scrollContent, styles.fill]}>{body}</View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

export function LoadingScreen({ title }: { title: string }) {
  return (
    <Screen title={title}>
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    </Screen>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <ThemedText style={styles.centerText}>{message}</ThemedText>
      {hint && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          {hint}
        </ThemedText>
      )}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
      {children}
    </ThemedText>
  );
}

/** Card-style grouped container for rows. */
export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, style]}>
      {children}
    </ThemedView>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const background =
    kind === 'primary' ? Accent : kind === 'danger' ? '#c94040' : theme.backgroundSelected;
  const color = kind === 'secondary' ? theme.text : '#ffffff';
  const dimmed = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={dimmed}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: pressed || dimmed ? 0.6 : 1 },
      ]}>
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText type="smallBold" style={{ color }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

/** Small inline tappable text (row actions). */
export function InlineAction({
  label,
  onPress,
  color,
}: {
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      {({ pressed }) => (
        <ThemedText
          type="smallBold"
          style={{ color: color ?? Accent, opacity: pressed ? 0.5 : 1 }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

/** +/- quantity stepper. */
export function Stepper({
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  step?: number;
}) {
  const theme = useTheme();
  const bump = (delta: number) => {
    const next = Math.max(min, Math.round((value + delta) * 100) / 100);
    if (next !== value) onChange(next);
  };
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => bump(-step)}
        hitSlop={8}
        style={[styles.stepperButton, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="smallBold">−</ThemedText>
      </Pressable>
      <ThemedText type="smallBold" style={styles.stepperValue}>
        {Number.isInteger(value) ? value : Math.round(value * 100) / 100}
      </ThemedText>
      <Pressable
        onPress={() => bump(step)}
        hitSlop={8}
        style={[styles.stepperButton, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="smallBold">+</ThemedText>
      </Pressable>
    </View>
  );
}

/** Bottom sheet for pickers and short forms. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <SafeAreaView edges={['bottom']}>
          <View style={styles.sheetHeader}>
            <ThemedText type="smallBold">{title}</ThemedText>
            <InlineAction label="Close" onPress={onClose} />
          </View>
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loading: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  centerText: {
    textAlign: 'center',
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
  },
  card: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  button: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 36,
    textAlign: 'center',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
});
