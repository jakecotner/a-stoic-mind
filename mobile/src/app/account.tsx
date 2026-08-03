// Account — the plan at a glance (upgrades and billing management happen on
// the website), the narration voice, sign out, and account deletion.
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  deleteAccount,
  fetchBillingSummary,
  fetchVoices,
  webBaseUrl,
  type BillingSummary,
  type Voice,
} from '@/lib/api';
import { getVoicePref, setVoicePref } from '@/lib/prefs';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';

export default function AccountScreen() {
  const theme = useTheme();
  const { user, signOut } = useAuth();
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicePref, setVoicePrefState] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingSummary().then(setBilling);
    fetchVoices().then(setVoices);
    setVoicePrefState(getVoicePref());
  }, []);

  const openWebsite = () => WebBrowser.openBrowserAsync(`${webBaseUrl()}/account`);

  const defaultVoice = voices.find((v) => v.default)?.id ?? '';

  return (
    <Screen title="Account">
      <ThemedText type="small" themeColor="textSecondary">
        {user?.email}
      </ThemedText>

      <Card style={styles.card}>
        <SectionTitle>Plan</SectionTitle>
        {billing === null ? (
          <ThemedText type="small" themeColor="textSecondary">
            Loading…
          </ThemedText>
        ) : billing.tier === 'plus' ? (
          <>
            <ThemedText type="small">
              <ThemedText type="smallBold">Plus</ThemedText>
              {billing.renews_at
                ? billing.cancel_at_period_end
                  ? ` — ends ${billing.renews_at}`
                  : ` — renews ${billing.renews_at}`
                : ''}
            </ThemedText>
            <Button label="Manage billing on the website" kind="secondary" onPress={openWebsite} />
          </>
        ) : (
          <>
            <ThemedText type="small">Free plan</ThemedText>
            <Button label="Upgrade to Plus on the website" kind="secondary" onPress={openWebsite} />
          </>
        )}
      </Card>

      {voices.length > 0 && (
        <Card style={styles.card}>
          <SectionTitle>Narration voice</SectionTitle>
          <ThemedText type="small" themeColor="textSecondary">
            The voice that reads passages aloud. Remembered on this device. Reading pace is set
            beside the play button while listening.
          </ThemedText>
          {voices.map((v) => {
            const selected = (voicePref || defaultVoice) === v.id;
            return (
              <Pressable
                key={v.id}
                onPress={() => {
                  // Choosing the server default clears the preference, so a
                  // future default change follows automatically.
                  const pref = v.id === defaultVoice ? '' : v.id;
                  setVoicePref(pref);
                  setVoicePrefState(pref);
                }}
                style={({ pressed }) => [
                  styles.voiceRow,
                  { backgroundColor: selected ? theme.backgroundSelected : 'transparent' },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="small">
                  <ThemedText type="smallBold" style={styles.voiceName}>
                    {v.id}
                  </ThemedText>{' '}
                  — {v.description}
                  {v.default ? ' (default)' : ''}
                </ThemedText>
              </Pressable>
            );
          })}
        </Card>
      )}

      <View style={styles.actions}>
        <Button label="Sign out" kind="secondary" onPress={signOut} />
        <Button
          label="Delete account"
          kind="danger"
          onPress={() =>
            Alert.alert(
              'Delete your account?',
              'This permanently deletes your account and all its data — journal entries, notes, and reading history. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    setError(null);
                    try {
                      await deleteAccount();
                      await signOut();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Something went wrong');
                    }
                  },
                },
              ]
            )
          }
        />
        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  voiceRow: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  voiceName: {
    textTransform: 'capitalize',
  },
  pressed: {
    opacity: 0.7,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  error: {
    color: '#c94040',
  },
});
