import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Narration play/stop toggle (mirror of the web app's PlayButton). The audio
 * itself is server-side cached TTS at /api/passages/{id}/audio.
 *
 * expo-audio is a native module that may predate the installed dev build, so
 * it's loaded dynamically and failures degrade to a short hint — never a
 * crash (same pattern as lib/reminders.ts).
 */

type Phase = 'idle' | 'loading' | 'playing';

// One narration at a time, app-wide.
let stopActive: (() => void) | null = null;

export function PlayButton({ src }: { src: string }) {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [hint, setHint] = useState<string | null>(null);
  const playerRef = useRef<any>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    const p = playerRef.current;
    playerRef.current = null;
    if (p) {
      try {
        p.pause();
        p.remove();
      } catch {
        /* already released */
      }
    }
    if (stopActive === stop) stopActive = null;
  }

  function stop() {
    cleanup();
    if (mounted.current) setPhase('idle');
  }

  async function play() {
    setHint(null);
    stopActive?.(); // stop whatever else is narrating
    setPhase('loading');
    try {
      const A = await import('expo-audio');
      await A.setAudioModeAsync({ playsInSilentMode: true });
      const player = A.createAudioPlayer(src);
      playerRef.current = player;
      stopActive = stop;
      player.addListener('playbackStatusUpdate', (status: any) => {
        if (playerRef.current !== player) return;
        if (status.didJustFinish) stop();
        else if (status.playing && mounted.current) setPhase('playing');
      });
      player.play();
    } catch {
      cleanup();
      if (mounted.current) {
        setPhase('idle');
        setHint('Narration needs the next app build.');
      }
    }
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={phase === 'idle' ? play : stop}
        hitSlop={8}
        disabled={phase === 'loading'}
        style={styles.button}>
        {phase === 'loading' ? (
          <ActivityIndicator size="small" color={theme.textSecondary} />
        ) : (
          <ThemedText type="linkPrimary">
            {phase === 'playing' ? '◼ Stop' : '▶ Listen'}
          </ThemedText>
        )}
      </Pressable>
      {hint && (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  button: {
    minWidth: 64,
  },
});
