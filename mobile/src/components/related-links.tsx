import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { fetchRelatedNotes, fetchRelatedPassages } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Note, Source } from '@/lib/types';

/* Cross-links (Stoa Plus), mirroring the web app: a passage's kindred
   journal entries and an entry's kindred passages. Silent on free accounts
   and when nothing resonates — suggestions, not sections. */

const snippet = (text: string, max = 150) =>
  text.length > max ? text.slice(0, max).trimEnd() + '…' : text;

/** Under a passage in the Read tab: the reader's own entries that speak to
    it. Tapping a snippet expands it in place (mobile has no per-entry
    journal screen to jump to). Mounted with key={passageId}. */
export function FromYourJournal({ passageId }: { passageId: number }) {
  const { user, isPlus } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isPlus) return;
    let cancelled = false;
    fetchRelatedNotes(passageId).then((ns) => {
      if (!cancelled) setNotes(ns);
    });
    return () => {
      cancelled = true;
    };
  }, [passageId, user, isPlus]);

  if (notes.length === 0) return null;
  return (
    <View style={styles.block}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        FROM YOUR JOURNAL
      </ThemedText>
      {notes.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => setExpanded((e) => (e === n.id ? null : n.id))}>
          <ThemedView type="backgroundElement" style={styles.item}>
            <ThemedText type="small" themeColor="textSecondary">
              {new Date(n.created_at).toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
              })}
              {n.passage ? ` · on ${n.passage.reference}` : ''}
            </ThemedText>
            <ThemedText type="small">
              {expanded === n.id ? n.content : snippet(n.content)}
            </ThemedText>
          </ThemedView>
        </Pressable>
      ))}
    </View>
  );
}

/** Under a journal entry: passages that speak to it, fetched on demand (one
    tap) rather than for every entry in the list. Tapping a passage opens it
    in the Read tab. */
export function KindredPassages({ noteId }: { noteId: string }) {
  const { isPlus } = useAuth();
  const router = useRouter();
  const [passages, setPassages] = useState<Source[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isPlus) return null;

  if (passages === null) {
    return (
      <Pressable
        disabled={busy}
        onPress={() => {
          setBusy(true);
          fetchRelatedPassages(noteId)
            .then(setPassages)
            .finally(() => setBusy(false));
        }}>
        <ThemedText type="linkPrimary">
          {busy ? 'Looking…' : 'Passages that speak to this'}
        </ThemedText>
      </Pressable>
    );
  }

  if (passages.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Nothing in the texts resonates strongly with this yet.
      </ThemedText>
    );
  }

  return (
    <View style={styles.block}>
      {passages.map((p) => (
        <Pressable
          key={p.id}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/read',
              params: { passage: String(p.id) },
            })
          }>
          <ThemedView type="backgroundElement" style={styles.item}>
            <ThemedText type="small" themeColor="textSecondary">
              {p.author}, {p.reference}
            </ThemedText>
            <ThemedText type="small">{snippet(p.text)}</ThemedText>
          </ThemedView>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
  },
  item: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: 2,
  },
});
