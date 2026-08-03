// The reading surface. Tapping a passage opens its breakdown inline
// (generated on the first view anywhere, cached for everyone after); a
// listen on any passage can roll to the end of the part, reading
// breakdowns too when the continue mode says so — ported from the web's
// ReaderShell, minus margin notes (a later pass).
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BoldMarkdown } from '@/components/bold-markdown';
import { PlayButton } from '@/components/play-button';
import { ThemedText } from '@/components/themed-text';
import { Button, InlineAction, LoadingScreen, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  breakdownAudioUrl,
  fetchBreakdown,
  fetchPassages,
  fetchReadIds,
  markRead,
  passageAudioUrl,
  type Passage,
} from '@/lib/api';
import { getNarrationSnapshot, subscribeNarration, type QueueItem } from '@/lib/narration';
import { type ContinueMode } from '@/lib/prefs';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';

/** The locator without the work-name prefix: "Meditations 4.3" -> "4.3". */
function locator(reference: string): string {
  return reference.split(' ').pop() ?? reference;
}

function BreakdownBlock({
  passage,
  queueFrom,
  ensureBreakdown,
}: {
  passage: Passage;
  queueFrom: (mode: ContinueMode) => QueueItem[];
  ensureBreakdown: (passageId: string) => Promise<boolean>;
}) {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'done'; text: string | null } | { kind: 'error' }
  >({ kind: 'loading' });

  useEffect(() => {
    let stale = false;
    setState({ kind: 'loading' });
    fetchBreakdown(passage.id).then((b) => {
      if (stale) return;
      setState(b === null ? { kind: 'error' } : { kind: 'done', text: b.breakdown ?? null });
    });
    return () => {
      stale = true;
    };
  }, [passage.id]);

  return (
    <View style={styles.breakdown}>
      <View style={styles.breakdownHeader}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.breakdownLabel}>
          BREAKDOWN
        </ThemedText>
        {state.kind === 'done' && state.text ? (
          <PlayButton src={breakdownAudioUrl(passage.id)} queueFrom={queueFrom} />
        ) : null}
      </View>
      {state.kind === 'loading' && (
        <ThemedText type="small" themeColor="textSecondary">
          Preparing the breakdown… the first view of a passage takes a few seconds while
          it&apos;s written.
        </ThemedText>
      )}
      {state.kind === 'error' && (
        <ThemedText type="small" themeColor="textSecondary">
          Couldn&apos;t load the breakdown — try again in a moment.
        </ThemedText>
      )}
      {state.kind === 'done' &&
        (state.text ? (
          <BoldMarkdown text={state.text} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            This passage&apos;s breakdown isn&apos;t available right now — the text stands on
            its own.
          </ThemedText>
        ))}
    </View>
  );
}

export default function ReaderScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { work, author, translator, part, label } = useLocalSearchParams<{
    work: string;
    author: string;
    translator: string;
    part: string;
    label: string;
  }>();
  const [passages, setPassages] = useState<Passage[] | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [markedNow, setMarkedNow] = useState(false);

  useEffect(() => {
    if (work === undefined) return;
    fetchPassages(work, part || undefined).then(setPassages);
    fetchReadIds(work).then((ids) => setReadIds(new Set(ids)));
  }, [work, part]);

  const alreadyRead =
    markedNow ||
    (passages !== undefined && passages.length > 0 && passages.every((p) => readIds.has(p.id)));

  // One breakdown-readiness promise per passage, so the engine's prefetch
  // and the actual play don't both trigger generation.
  const breakdownReady = useRef(new Map<string, Promise<boolean>>());
  const ensureBreakdown = useCallback((passageId: string) => {
    let p = breakdownReady.current.get(passageId);
    if (!p) {
      p = fetchBreakdown(passageId)
        .then((b) => !!b?.breakdown)
        .catch(() => false)
        .then((ok) => {
          if (!ok) breakdownReady.current.delete(passageId);
          return ok;
        });
      breakdownReady.current.set(passageId, p);
    }
    return p;
  }, []);

  const queueFrom = useCallback(
    (start: number, mode: ContinueMode): QueueItem[] => {
      const all = passages ?? [];
      const rest = mode === 'off' ? all.slice(start, start + 1) : all.slice(start);
      const items: QueueItem[] = [];
      for (const p of rest) {
        items.push({
          src: passageAudioUrl(p.id),
          passageId: p.id,
          kind: 'passage',
          title: p.reference,
        });
        if (mode === 'reflections')
          items.push({
            src: breakdownAudioUrl(p.id),
            passageId: p.id,
            kind: 'breakdown',
            title: `Breakdown — ${p.reference}`,
            prepare: () => ensureBreakdown(p.id),
          });
      }
      return items;
    },
    [passages, ensureBreakdown]
  );

  // A play from an open breakdown starts at the breakdown itself, then
  // follows the same plan as any other listen.
  const breakdownQueueFrom = useCallback(
    (p: Passage) =>
      (mode: ContinueMode): QueueItem[] => {
        const head: QueueItem = {
          src: breakdownAudioUrl(p.id),
          passageId: p.id,
          kind: 'breakdown',
          title: `Breakdown — ${p.reference}`,
          prepare: () => ensureBreakdown(p.id),
        };
        const i = (passages ?? []).findIndex((x) => x.id === p.id);
        if (mode === 'off' || i < 0) return [head];
        return [head, ...queueFrom(i + 1, mode)];
      },
    [passages, queueFrom, ensureBreakdown]
  );

  // Follow along with the narration: highlight the passage being read, and
  // open its breakdown while the breakdown is being read.
  const snap = useSyncExternalStore(subscribeNarration, getNarrationSnapshot, getNarrationSnapshot);
  const narrating =
    (snap.state === 'playing' || snap.state === 'loading') &&
    snap.item &&
    (passages ?? []).some((p) => p.id === snap.item!.passageId)
      ? snap.item
      : null;
  const narratingId = narrating?.passageId ?? null;
  const narratingKind = narrating?.kind ?? null;

  const autoOpened = useRef(false);
  useEffect(() => {
    if (!narratingId) {
      autoOpened.current = false;
      return;
    }
    if (narratingKind === 'breakdown') {
      setSelectedId(narratingId);
      autoOpened.current = true;
    } else if (autoOpened.current) {
      setSelectedId(null);
      autoOpened.current = false;
    }
  }, [narratingId, narratingKind]);

  if (!passages) return <LoadingScreen title={work ?? 'Reader'} />;

  return (
    <Screen title={work ?? ''}>
      <View style={styles.headerBlock}>
        <InlineAction label={`← ${work}`} onPress={() => router.back()} />
        <ThemedText type="small" themeColor="textSecondary">
          {author}
          {label ? ` · ${label}` : ''} · translated by {translator}
        </ThemedText>
      </View>

      {passages.map((p, i) => {
        const active = selectedId === p.id || narratingId === p.id;
        return (
          <View key={p.id}>
            <Pressable
              onPress={() => setSelectedId(selectedId === p.id ? null : p.id)}
              style={[styles.passage, active && { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.passageHeader}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.locator}>
                  {locator(p.reference)}
                </ThemedText>
                <PlayButton src={passageAudioUrl(p.id)} queueFrom={(mode) => queueFrom(i, mode)} />
              </View>
              <ThemedText style={styles.passageText}>{p.text}</ThemedText>
            </Pressable>
            {selectedId === p.id && (
              <BreakdownBlock
                passage={p}
                queueFrom={breakdownQueueFrom(p)}
                ensureBreakdown={ensureBreakdown}
              />
            )}
          </View>
        );
      })}

      {user && passages.length > 0 && (
        <Button
          label={alreadyRead ? 'Read ✓' : 'Mark as read'}
          kind="secondary"
          disabled={alreadyRead}
          onPress={async () => {
            try {
              await markRead(work!, part ?? '');
              setMarkedNow(true);
            } catch {
              // Leave the button as-is; a retry is one tap away.
            }
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    gap: Spacing.one,
  },
  passage: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
    marginHorizontal: -Spacing.one,
  },
  passageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  locator: {
    letterSpacing: 0.5,
  },
  passageText: {
    fontSize: 16,
    lineHeight: 26,
  },
  breakdown: {
    marginTop: Spacing.one,
    marginBottom: Spacing.two,
    paddingLeft: Spacing.three,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(128,128,128,0.35)',
    gap: Spacing.one,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  breakdownLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
