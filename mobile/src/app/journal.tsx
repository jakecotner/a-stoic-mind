// The journal — the mobile counterpart of the web's journal pad, plus the
// phone's own trick: dictation. Speak an entry (on a walk, after the
// morning passage); the recording is transcribed server-side and lands in
// the draft, and nothing is saved until the user saves the entry itself.
// The arrows step back through previous days' entries.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { BoldMarkdown } from '@/components/bold-markdown';
import { DictationButton } from '@/components/dictation-button';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, InlineAction, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  createJournalEntry,
  deleteJournalEntry,
  fetchDaily,
  fetchJournal,
  fetchJournalStats,
  reflectOnEntry,
  ReflectionCapError,
  updateJournalEntry,
  type JournalEntry,
  type JournalStats,
} from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';

/** Local-date ISO (YYYY-MM-DD) — not toISOString(), which shifts to UTC. */
function toIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toIso(new Date(y, m - 1, d + days));
}

function labelFor(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function EntryCard({
  entry,
  onChanged,
  reflecting = false,
}: {
  entry: JournalEntry;
  onChanged: () => void;
  /** True while this entry's reflection is being written. */
  reflecting?: boolean;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const when = new Date(entry.created_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Card style={styles.entryCard}>
      <View style={styles.entryHeader}>
        <ThemedText type="small" themeColor="textSecondary">
          {when}
        </ThemedText>
        <View style={styles.entryActions}>
          {editing ? (
            <>
              <InlineAction
                label="Save"
                onPress={async () => {
                  if (busy || draft.trim().length === 0) return;
                  setBusy(true);
                  setError(null);
                  try {
                    await updateJournalEntry(entry.id, draft.trim());
                    setEditing(false);
                    onChanged();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Save failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <InlineAction
                label="Cancel"
                onPress={() => {
                  setDraft(entry.content);
                  setEditing(false);
                }}
              />
            </>
          ) : (
            <>
              <InlineAction label="Edit" onPress={() => setEditing(true)} />
              <InlineAction
                label="Delete"
                color="#c94040"
                onPress={async () => {
                  if (busy) return;
                  setBusy(true);
                  try {
                    await deleteJournalEntry(entry.id);
                    onChanged();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Delete failed');
                    setBusy(false);
                  }
                }}
              />
            </>
          )}
        </View>
      </View>
      {editing ? (
        <TextInput
          multiline
          value={draft}
          onChangeText={setDraft}
          style={[styles.editInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
      ) : (
        <ThemedText type="small">{entry.content}</ThemedText>
      )}
      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}
      {entry.reflection ? (
        <View style={[styles.reflection, { borderLeftColor: theme.backgroundSelected }]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.reflectionLabel}>
            REFLECTION
          </ThemedText>
          <BoldMarkdown text={entry.reflection} />
        </View>
      ) : reflecting ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.reflecting}>
          Reflecting…
        </ThemedText>
      ) : null}
    </Card>
  );
}

export default function JournalScreen() {
  const theme = useTheme();
  const today = toIso(new Date());
  // null = today (the working pad); an ISO date = browsing back.
  const [on, setOn] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [passageId, setPassageId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reflectingId, setReflectingId] = useState<string | null>(null);

  const browsing = on !== null;

  const reload = useCallback(() => {
    fetchJournal(on ?? undefined).then(setEntries);
    if (on === null) fetchJournalStats().then(setStats);
  }, [on]);

  useEffect(() => {
    setEntries([]);
    reload();
  }, [reload]);

  // Entries written today attach to today's passage, like the web pad.
  useEffect(() => {
    fetchDaily().then((d) => setPassageId(d?.passage.id ?? null));
  }, []);

  async function saveEntry() {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    setNotice(null);
    let saved: JournalEntry;
    try {
      saved = await createJournalEntry(content, passageId);
      setDraft('');
      reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Save failed');
      setBusy(false);
      return;
    }
    setBusy(false);
    // The entry is safe; the reflection arrives when it arrives.
    setReflectingId(saved.id);
    try {
      await reflectOnEntry(saved.id);
      reload();
    } catch (e) {
      if (e instanceof ReflectionCapError) {
        setNotice(
          `Your entry is saved. You've used all${e.limit != null ? ` ${e.limit}` : ''} of this month's free reflections — upgrade to Plus on the website for unlimited.`
        );
      } else {
        setNotice(
          e instanceof Error
            ? `Your entry is saved. ${e.message}`
            : "Your entry is saved; the reflection couldn't be written."
        );
      }
    } finally {
      setReflectingId(null);
    }
  }

  return (
    <Screen title="Journal">
      <View style={styles.dayNav}>
        <InlineAction label="←" onPress={() => setOn(shiftIso(on ?? today, -1))} />
        <ThemedText type="smallBold">{browsing ? labelFor(on) : 'Today'}</ThemedText>
        {browsing && (
          <InlineAction
            label="→"
            onPress={() => {
              const next = shiftIso(on, 1);
              setOn(next >= today ? null : next);
            }}
          />
        )}
        {browsing && <InlineAction label="Back to today" onPress={() => setOn(null)} />}
      </View>

      {!browsing && (
        <>
          {stats && stats.total_entries > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {stats.total_entries} {stats.total_entries === 1 ? 'entry' : 'entries'}
              {stats.streak_days > 1 ? ` · ${stats.streak_days}-day streak` : ''}
            </ThemedText>
          )}
          <TextInput
            multiline
            placeholder="Write about the passage, or whatever is on your mind — or dictate it…"
            placeholderTextColor={theme.textSecondary}
            value={draft}
            onChangeText={setDraft}
            style={[styles.pad, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <View style={styles.padActions}>
            <View style={styles.padActionButton}>
              <DictationButton
                onText={(text) => setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text))}
                onError={(message) => setNotice(message || null)}
              />
            </View>
            <View style={styles.padActionButton}>
              <Button
                label="Save entry"
                busy={busy}
                disabled={draft.trim().length === 0}
                onPress={saveEntry}
              />
            </View>
          </View>
          {notice && (
            <ThemedText type="small" themeColor="textSecondary">
              {notice}
            </ThemedText>
          )}
        </>
      )}

      {entries.length > 0 ? (
        <View style={styles.entries}>
          <SectionTitle>{browsing ? labelFor(on) : 'Today'}</SectionTitle>
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onChanged={reload}
              reflecting={entry.id === reflectingId}
            />
          ))}
        </View>
      ) : browsing ? (
        <EmptyState message="No entries this day." />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  pad: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  padActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  padActionButton: {
    flex: 1,
  },
  entries: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  entryCard: {
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entryActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  reflection: {
    borderLeftWidth: 2,
    paddingLeft: Spacing.three,
    gap: Spacing.one,
  },
  reflectionLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  reflecting: {
    fontStyle: 'italic',
  },
  error: {
    color: '#c94040',
  },
});
