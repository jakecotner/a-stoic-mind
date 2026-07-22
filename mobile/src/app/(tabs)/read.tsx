import { useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarkdownLite } from '@/components/markdown-lite';
import { PassageDiscussion } from '@/components/passage-discussion';
import { PlayButton } from '@/components/play-button';
import { FromYourJournal } from '@/components/related-links';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createNote,
  fetchNotes,
  fetchReadingPage,
  fetchToc,
  fetchWorks,
  streamReflection,
  trackReads,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { API_BASE } from '@/lib/config';
import type { Note, ReadingPage, TocSection, Work } from '@/lib/types';

// Reading position, persisted per work. SecureStore is already in the build
// (auth token), so it doubles as small-value storage; keys must be
// [A-Za-z0-9._-] so work titles are slugged.
const slug = (work: string) => work.replace(/[^A-Za-z0-9._-]/g, '_');
const LAST_KEY = 'stoa_read_last';
const posKey = (work: string) => `stoa_read_pos_${slug(work)}`;

async function savePosition(work: string, offset: number) {
  try {
    await SecureStore.setItemAsync(posKey(work), String(offset));
    await SecureStore.setItemAsync(LAST_KEY, work);
  } catch {
    /* position memory is best-effort */
  }
}

async function loadLast(): Promise<{ work: string; offset: number } | null> {
  try {
    const work = await SecureStore.getItemAsync(LAST_KEY);
    if (!work) return null;
    const offset = Number((await SecureStore.getItemAsync(posKey(work))) ?? '0');
    return { work, offset: Number.isFinite(offset) ? offset : 0 };
  } catch {
    return null;
  }
}

/** On-demand LLM breakdown of the visible passage (cached server-side). */
function PassageBreakdown({ passageId }: { passageId: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const started = useRef(false);

  const toggle = () => {
    if (!started.current) {
      started.current = true;
      setStreaming(true);
      streamReflection(passageId, {
        onMeta: () => {},
        onDelta: (d) => setText((t) => t + d),
        onError: () => setStreaming(false),
        onDone: () => setStreaming(false),
      }).catch(() => setStreaming(false));
    }
    setOpen((o) => !o);
  };

  return (
    <View style={styles.breakdown}>
      <Pressable onPress={toggle}>
        <ThemedText type="linkPrimary">
          {open ? 'Hide breakdown' : 'Breakdown from the Stoa'}
        </ThemedText>
      </Pressable>
      {open &&
        (text ? (
          <MarkdownLite>{text}</MarkdownLite>
        ) : streaming ? (
          <ThemedText type="small" themeColor="textSecondary">
            Reading the passage…
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            The Stoa is unavailable right now.
          </ThemedText>
        ))}
    </View>
  );
}

/** Margin notes on the visible passage. */
function PassageNotes({ passageId }: { passageId: number }) {
  const { user } = useAuth();
  const theme = useTheme();
  const [notes, setNotes] = useState<Note[]>([]);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setComposing(false);
    setDraft('');
    if (!user) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    fetchNotes(passageId)
      .then((ns) => {
        if (!cancelled) setNotes(ns);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [passageId, user]);

  async function save() {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const note = await createNote(content, passageId);
      setNotes((ns) => [note, ...ns]);
      setDraft('');
      setComposing(false);
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Sign in to keep notes in the margins.
      </ThemedText>
    );
  }

  return (
    <View style={styles.notes}>
      {notes.map((n) => (
        <ThemedView key={n.id} type="backgroundElement" style={styles.marginNote}>
          <ThemedText type="small">{n.content}</ThemedText>
        </ThemedView>
      ))}
      {composing ? (
        <View style={styles.noteCompose}>
          <TextInput
            style={[
              styles.noteInput,
              { backgroundColor: theme.backgroundElement, color: theme.text },
            ]}
            placeholder="A note in the margin…"
            placeholderTextColor={theme.textSecondary}
            multiline
            autoFocus
            value={draft}
            onChangeText={setDraft}
          />
          <View style={styles.noteActions}>
            <Pressable
              style={[
                styles.smallButton,
                { backgroundColor: theme.text },
                (busy || !draft.trim()) && styles.disabled,
              ]}
              onPress={save}
              disabled={busy || !draft.trim()}>
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                Save note
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setComposing(false)}>
              <ThemedText type="small" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setComposing(true)}>
          <ThemedText type="linkPrimary">Add a note</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

export default function ReadScreen() {
  const theme = useTheme();
  // Passage id handed over by a journal cross-link ("passages that speak
  // to this").
  const params = useLocalSearchParams<{ passage?: string }>();
  const [works, setWorks] = useState<Work[]>([]);
  const [page, setPage] = useState<ReadingPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ work: string; offset: number } | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [toc, setToc] = useState<TocSection[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    fetchWorks()
      .then(setWorks)
      .catch(() => setError('Could not reach the server.'));
    loadLast().then(setLast);
  }, []);

  const openPage = useCallback(
    (params: { work: string; offset: number } | { passageId: number }) => {
      setLoading(true);
      setError(null);
      fetchReadingPage(params, 1)
        .then((p) => {
          setPage(p);
          setTocOpen(false);
          trackReads(p.passages.map((x) => x.id));
          savePosition(p.work, p.offset);
          setLast({ work: p.work, offset: p.offset });
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        })
        .catch(() => setError('Could not load the passage.'))
        .finally(() => setLoading(false));
    },
    [],
  );

  // Navigate to a cross-linked passage when the tab is (re)entered with one.
  // Deferred a tick: openPage sets loading state, which must not happen
  // synchronously inside the effect body.
  const handledPassage = useRef<string | null>(null);
  useEffect(() => {
    if (!params.passage || handledPassage.current === params.passage) return;
    handledPassage.current = params.passage;
    const id = Number(params.passage);
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) openPage({ passageId: id });
    });
    return () => {
      cancelled = true;
    };
  }, [params.passage, openPage]);

  const openToc = useCallback(() => {
    if (!page) return;
    if (tocOpen) {
      setTocOpen(false);
      return;
    }
    fetchToc(page.work)
      .then((sections) => {
        setToc(sections);
        setTocOpen(true);
      })
      .catch(() => {});
  }, [page, tocOpen]);

  // --- Work picker ---
  if (!page) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <ThemedText type="subtitle">Read</ThemedText>

            {last && (
              <Pressable
                style={[styles.continueButton, { backgroundColor: theme.text }]}
                onPress={() => openPage(last)}>
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  Continue: {last.work}
                </ThemedText>
              </Pressable>
            )}

            {works.map((w) => (
              <Pressable key={w.work} onPress={() => openPage({ work: w.work, offset: 0 })}>
                <ThemedView type="backgroundElement" style={styles.workCard}>
                  <ThemedText type="smallBold">{w.work}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {w.author} · trans. {w.translator}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {w.passage_count} passages
                  </ThemedText>
                </ThemedView>
              </Pressable>
            ))}

            {works.length === 0 && !error && (
              <ThemedText themeColor="textSecondary">Loading…</ThemedText>
            )}
            {error && <ThemedText themeColor="textSecondary">{error}</ThemedText>}
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // --- Reading view ---
  const passage = page.passages[0];
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.readHeader}>
          <Pressable onPress={() => setPage(null)} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              ‹ Works
            </ThemedText>
          </Pressable>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.workTitle}>
            {page.work}
          </ThemedText>
          <Pressable onPress={openToc} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              Contents
            </ThemedText>
          </Pressable>
        </View>

        {tocOpen ? (
          <ScrollView contentContainerStyle={styles.scroll}>
            {toc.map((s) => (
              <Pressable
                key={s.label}
                onPress={() => openPage({ work: page.work, offset: s.offset })}>
                <View style={styles.tocRow}>
                  <ThemedText
                    type={
                      page.offset >= s.offset && page.offset < s.offset + s.count
                        ? 'smallBold'
                        : 'small'
                    }>
                    {s.label}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {s.count}
                  </ThemedText>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <>
            <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
              {passage && (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    {passage.reference}
                  </ThemedText>
                  <ThemedText style={styles.passageText}>{passage.text}</ThemedText>
                  <PlayButton src={`${API_BASE}/api/passages/${passage.id}/audio`} />
                  <PassageBreakdown key={`b${passage.id}`} passageId={passage.id} />
                  <PassageNotes key={`n${passage.id}`} passageId={passage.id} />
                  <FromYourJournal key={`r${passage.id}`} passageId={passage.id} />
                  <PassageDiscussion key={`d${passage.id}`} passageId={passage.id} />
                </>
              )}
              {error && <ThemedText themeColor="textSecondary">{error}</ThemedText>}
            </ScrollView>

            <View style={[styles.pager, { borderTopColor: theme.backgroundElement }]}>
              <Pressable
                style={[styles.pageButton, page.offset === 0 && styles.disabled]}
                disabled={page.offset === 0 || loading}
                onPress={() => openPage({ work: page.work, offset: page.offset - 1 })}
                hitSlop={8}>
                <ThemedText type="smallBold">‹ Prev</ThemedText>
              </Pressable>
              {loading ? (
                <ActivityIndicator size="small" color={theme.textSecondary} />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {page.offset + 1} of {page.total}
                </ThemedText>
              )}
              <Pressable
                style={[
                  styles.pageButton,
                  page.offset + 1 >= page.total && styles.disabled,
                ]}
                disabled={page.offset + 1 >= page.total || loading}
                onPress={() => openPage({ work: page.work, offset: page.offset + 1 })}
                hitSlop={8}>
                <ThemedText type="smallBold">Next ›</ThemedText>
              </Pressable>
            </View>
          </>
        )}
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
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  continueButton: {
    borderRadius: Spacing.two,
    paddingVertical: 12,
    alignItems: 'center',
  },
  workCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: 2,
  },
  readHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    gap: Spacing.three,
  },
  workTitle: {
    flex: 1,
    textAlign: 'center',
  },
  passageText: {
    fontSize: 18,
    lineHeight: 30,
  },
  breakdown: {
    gap: Spacing.two,
  },
  notes: {
    gap: Spacing.two,
  },
  marginNote: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  noteCompose: {
    gap: Spacing.two,
  },
  noteInput: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    fontSize: 15,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  noteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  smallButton: {
    borderRadius: Spacing.two,
    paddingVertical: 8,
    paddingHorizontal: Spacing.three,
  },
  tocRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    paddingBottom: BottomTabInset,
    borderTopWidth: 1,
  },
  pageButton: {
    paddingVertical: Spacing.one,
  },
  disabled: {
    opacity: 0.35,
  },
});
