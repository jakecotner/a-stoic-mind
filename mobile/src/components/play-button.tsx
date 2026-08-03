// Passage narration control, the mobile counterpart of the web PlayButton:
// a listen/stop toggle over the shared engine (lib/narration.ts), with pace
// and continue-mode chips beside it while narration plays. On a phone the
// chips cycle through their options on tap instead of opening menus.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  getNarrationSnapshot,
  setNarrationContinueMode,
  setNarrationPace,
  startNarration,
  stopIfOwner,
  stopNarration,
  subscribeNarration,
  type QueueItem,
} from '@/lib/narration';
import { getContinuePref, getPacePref, PACES, type ContinueMode } from '@/lib/prefs';
import { useTheme } from '@/hooks/use-theme';

const CONTINUE_CHIP: Record<ContinueMode, string> = {
  off: 'auto: off',
  passages: 'auto: on',
  reflections: 'auto: on+',
};

const MODES: ContinueMode[] = ['off', 'passages', 'reflections'];

export function PlayButton({
  src,
  queueFrom,
}: {
  src: string;
  queueFrom?: (mode: ContinueMode) => QueueItem[];
}) {
  const snap = useSyncExternalStore(subscribeNarration, getNarrationSnapshot, getNarrationSnapshot);
  const theme = useTheme();
  // This button renders whatever item the engine is on, matched by URL —
  // so when a run rolls to the next passage, the old button falls idle and
  // the new one lights up, whichever button started the run.
  const mine = snap.item?.src === src;
  const state = mine ? snap.state : 'idle';
  const activeNow = state === 'playing' || state === 'loading';

  const [pace, setPace] = useState(1);
  const [mode, setMode] = useState<ContinueMode>('off');
  const ownerRef = useRef<number | null>(null);

  // Chips reflect the device prefs whenever this button becomes the live
  // one — playback may have arrived here from another button's tap.
  useEffect(() => {
    if (activeNow) {
      setPace(getPacePref());
      setMode(getContinuePref());
    }
  }, [activeNow]);

  // Unmount: a run this button started shouldn't keep narrating a screen
  // that's gone.
  useEffect(() => {
    return () => {
      if (ownerRef.current !== null) stopIfOwner(ownerRef.current);
    };
  }, [src]);

  function toggle() {
    if (activeNow) {
      stopNarration();
      return;
    }
    const build = queueFrom ?? (() => [{ src, passageId: '', kind: 'passage' as const }]);
    ownerRef.current = startNarration(build);
  }

  return (
    <View style={styles.row}>
      <Pressable onPress={toggle} hitSlop={10} style={styles.icon}>
        {state === 'loading' ? (
          <ActivityIndicator size="small" />
        ) : (
          <ThemedText
            type="smallBold"
            themeColor="textSecondary"
            style={state === 'failed' && styles.failed}>
            {state === 'playing' ? '■' : '▶'}
          </ThemedText>
        )}
      </Pressable>
      {state === 'failed' && (
        <ThemedText type="small" themeColor="textSecondary">
          audio unavailable — tap to retry
        </ThemedText>
      )}
      {activeNow && (
        <Pressable
          onPress={() => {
            const next = PACES[(PACES.indexOf(pace) + 1) % PACES.length];
            setNarrationPace(next);
            setPace(next);
          }}
          hitSlop={8}
          style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {pace}x
          </ThemedText>
        </Pressable>
      )}
      {activeNow && queueFrom && (
        <Pressable
          onPress={() => {
            const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
            setNarrationContinueMode(next);
            setMode(next);
          }}
          hitSlop={8}
          style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {CONTINUE_CHIP[mode]}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    minWidth: 20,
    alignItems: 'center',
  },
  chip: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  failed: {
    opacity: 0.5,
  },
});
