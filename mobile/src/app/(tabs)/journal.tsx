import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntryThread } from '@/components/entry-thread';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createNote, deleteNote, fetchDaily, fetchNotes } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Note } from '@/lib/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function EntryCard({
  note,
  seedPassageId,
  autoStart,
  onThreadKnown,
  onDeleted,
}: {
  note: Note;
  seedPassageId: number | null;
  autoStart: boolean;
  onThreadKnown: (noteId: string, threadId: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteNote(note.id);
      onDeleted(note.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView type="backgroundElement" style={styles.entry}>
      <View style={styles.entryHead}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(note.created_at)}
        </ThemedText>
        {confirming ? (
          <View style={styles.confirmRow}>
            <Pressable onPress={remove} disabled={busy}>
              <ThemedText type="smallBold" style={styles.deleteText}>
                Delete?
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setConfirming(false)}>
              <ThemedText type="small" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setConfirming(true)}>
            <ThemedText type="small" themeColor="textSecondary">
              Delete
            </ThemedText>
          </Pressable>
        )}
      </View>

      {note.passage && (
        <ThemedText type="small" themeColor="textSecondary">
          on {note.passage.reference}
        </ThemedText>
      )}

      <ThemedText>{note.content}</ThemedText>

      <EntryThread
        note={note}
        seedPassageId={seedPassageId}
        autoStart={autoStart}
        onThreadKnown={onThreadKnown}
      />
    </ThemedView>
  );
}

export default function JournalScreen() {
  const { user, signOut, deleteAccount } = useAuth();
  const theme = useTheme();
  // Passage id handed over by the Today tab's "Reflect on this".
  const params = useLocalSearchParams<{ seed?: string }>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Today's passage: fallback seed for "Save & reflect" (mirrors the web app).
  const [dailyId, setDailyId] = useState<number | null>(null);
  // Entry that should immediately open its reflection thread after saving.
  const [autoReflectId, setAutoReflectId] = useState<string | null>(null);

  useEffect(() => {
    fetchDaily()
      .then((p) => setDailyId(p?.id ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    fetchNotes()
      .then((ns) => {
        if (!cancelled) setNotes(ns);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const seedId = params.seed ? Number(params.seed) : dailyId;

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your journal, reflections, reading history, and intention. There is no undo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (e) {
              Alert.alert(
                'Could not delete account',
                e instanceof Error ? e.message : String(e),
              );
            }
          },
        },
      ],
    );
  }

  async function compose(reflect: boolean) {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      const note = await createNote(content);
      setNotes((ns) => [note, ...ns]);
      setDraft('');
      if (reflect) setAutoReflectId(note.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (user === null) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle">Journal</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          Sign in to keep a journal — daily reflections on the texts, and the
          Stoa to think alongside you.
        </ThemedText>
        <Link href="/sign-in" asChild>
          <Pressable
            style={StyleSheet.flatten([
              styles.primaryButton,
              { backgroundColor: theme.text },
            ])}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              Sign in
            </ThemedText>
          </Pressable>
        </Link>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? BottomTabInset : 0}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.header}>
              <ThemedText type="subtitle">Journal</ThemedText>
              <Pressable onPress={signOut}>
                <ThemedText type="small" themeColor="textSecondary">
                  Sign out
                </ThemedText>
              </Pressable>
            </View>

            <View style={styles.composeBox}>
              <TextInput
                style={[
                  styles.composeInput,
                  { backgroundColor: theme.backgroundElement, color: theme.text },
                ]}
                placeholder="Respond to today's passage — or write what's on your mind"
                placeholderTextColor={theme.textSecondary}
                multiline
                value={draft}
                onChangeText={setDraft}
              />
              <View style={styles.composeActions}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    styles.grow,
                    { backgroundColor: theme.text },
                    (busy || !draft.trim()) && styles.disabled,
                  ]}
                  onPress={() => compose(true)}
                  disabled={busy || !draft.trim()}>
                  <ThemedText type="smallBold" style={{ color: theme.background }}>
                    Save & reflect with the Stoa
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={styles.justSave}
                  onPress={() => compose(false)}
                  disabled={busy || !draft.trim()}>
                  <ThemedText type="linkPrimary">Just save</ThemedText>
                </Pressable>
              </View>
            </View>

            {error && (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            )}

            {notes.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                Nothing here yet. Marcus Aurelius wrote his Meditations for no
                reader but himself — begin yours here.
              </ThemedText>
            )}

            {notes.map((note) => (
              <EntryCard
                key={note.id}
                note={note}
                seedPassageId={
                  note.id === autoReflectId ? seedId : note.passage_id
                }
                autoStart={note.id === autoReflectId}
                onThreadKnown={(noteId, threadId) =>
                  setNotes((ns) =>
                    ns.map((x) =>
                      x.id === noteId ? { ...x, thread_id: threadId } : x,
                    ),
                  )
                }
                onDeleted={(id) =>
                  setNotes((ns) => ns.filter((x) => x.id !== id))
                }
              />
            ))}

            <View style={styles.footer}>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.centerText}>
                A philosophical practice tool, not therapy or medical care. In
                crisis? Call or text 988 (US) or your local emergency services.
              </ThemedText>
              <Pressable onPress={confirmDeleteAccount} hitSlop={8}>
                <ThemedText type="small" style={styles.deleteText}>
                  Delete account
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centerText: {
    textAlign: 'center',
  },
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  composeBox: {
    gap: Spacing.two,
  },
  composeInput: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  composeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  grow: {
    flex: 1,
  },
  justSave: {
    paddingHorizontal: Spacing.two,
  },
  primaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: 12,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  entry: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  entryHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  confirmRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.four,
    paddingHorizontal: Spacing.three,
  },
  deleteText: {
    color: '#d33',
  },
  error: {
    color: '#d33',
  },
});
