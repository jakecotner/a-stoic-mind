import { Link } from 'expo-router';
import { StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';

export default function JournalScreen() {
  const { user, signOut } = useAuth();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {user === undefined && (
          <ThemedText themeColor="textSecondary">Loading…</ThemedText>
        )}

        {user === null && (
          <>
            <ThemedText type="subtitle">Journal</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              Sign in to keep a journal and sync it with the web app.
            </ThemedText>
            <Link href="/sign-in" asChild>
              <Pressable style={[styles.button, { backgroundColor: theme.text }]}>
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  Sign in
                </ThemedText>
              </Pressable>
            </Link>
          </>
        )}

        {user && (
          <>
            <ThemedText type="subtitle">Journal</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              Signed in as {user.email}. Journal entries are coming next.
            </ThemedText>
            <Pressable
              style={[styles.button, { backgroundColor: theme.backgroundElement }]}
              onPress={signOut}>
              <ThemedText type="smallBold">Sign out</ThemedText>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  center: {
    textAlign: 'center',
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: 12,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
  },
});
