// One sitting of practice — the mobile twin of the web's
// PracticeSessionFlow. Takes over the Practice tab while running: a timer
// against the standing intention, the guide's steps one at a time (or a
// freeform pad), and an End button that records the session. While the
// session runs the audio mode ducks instead of silencing, so music from
// another app (Spotify, anything) keeps playing under the narration.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { DictationButton } from '@/components/dictation-button';
import { PlayButton } from '@/components/play-button';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, InlineAction, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  createJournalEntry,
  endPracticeSession,
  fetchDaily,
  fetchIntention,
  passageAudioUrl,
  startPracticeSession,
  type Daily,
  type Guide,
  type PracticeSession,
} from '@/lib/api';
import { setSessionMixing } from '@/lib/narration';
import { useTheme } from '@/hooks/use-theme';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function PassageBlock({ daily }: { daily: Daily }) {
  return (
    <View style={styles.passageBlock}>
      <View style={styles.referenceRow}>
        <ThemedText type="smallBold">{daily.passage.reference}</ThemedText>
        <PlayButton src={passageAudioUrl(daily.passage.id)} />
      </View>
      <ThemedText type="small" style={styles.passageText}>
        {daily.passage.text}
      </ThemedText>
    </View>
  );
}

export function PracticeSessionView({
  guide,
  onDone,
}: {
  guide: Guide | null;
  onDone: () => void;
}) {
  const theme = useTheme();
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [targetMinutes, setTargetMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const completedRef = useRef<string[]>([]);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    setSessionMixing(true);
    startPracticeSession(guide?.key ?? null)
      .then((s) => {
        setSession(s);
        startedAtRef.current = Date.now();
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not start the session'));
    fetchDaily().then(setDaily);
    fetchIntention().then((i) => setTargetMinutes(i ? i.minutes_per_day : null));
    const tick = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)),
      1000
    );
    return () => {
      clearInterval(tick);
      setSessionMixing(false);
    };
  }, [guide]);

  const steps = guide?.steps ?? [];
  const step = stepIdx < steps.length ? steps[stepIdx] : null;
  const finishedSteps = guide !== null && stepIdx >= steps.length;

  const markAndAdvance = (key?: string) => {
    if (key && !completedRef.current.includes(key)) completedRef.current.push(key);
    setDraft('');
    setStepIdx((i) => i + 1);
  };

  async function savePrompt() {
    if (!step || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createJournalEntry(`${step.title}\n\n${draft.trim()}`, daily?.passage.id ?? null);
      markAndAdvance(step.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that entry');
    } finally {
      setBusy(false);
    }
  }

  async function saveFreeform() {
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createJournalEntry(draft.trim(), daily?.passage.id ?? null);
      if (!completedRef.current.includes('journal')) completedRef.current.push('journal');
      setDraft('');
      setSavedCount((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that entry');
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    setBusy(true);
    try {
      if (session) await endPracticeSession(session.id, completedRef.current);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not end the session');
      setBusy(false);
    }
  }

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.backgroundSelected },
  ];

  return (
    <Screen title={guide ? guide.title : 'Practice'}>
      <View style={styles.headerRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatElapsed(elapsed)}
          {targetMinutes ? ` / ${targetMinutes} min` : ''}
        </ThemedText>
        <InlineAction label="End session" onPress={end} />
      </View>

      {guide && (
        <ThemedText type="small" themeColor="textSecondary">
          {guide.tagline}
        </ThemedText>
      )}
      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}

      {/* Guided: one step at a time */}
      {guide && step && (
        <Card style={styles.stepCard}>
          <SectionTitle>
            Step {stepIdx + 1} of {steps.length} — {step.title}
          </SectionTitle>
          <ThemedText type="small" themeColor="textSecondary">
            {step.body}
          </ThemedText>

          {step.kind === 'passage' ? (
            <>
              {daily ? (
                <PassageBlock daily={daily} />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Loading today’s passage…
                </ThemedText>
              )}
              <View style={styles.actionRow}>
                <View style={styles.flexOne}>
                  <Button label="Done — continue" onPress={() => markAndAdvance(step.key)} />
                </View>
                <View style={styles.flexOne}>
                  <Button label="Skip" kind="secondary" onPress={() => markAndAdvance()} />
                </View>
              </View>
            </>
          ) : (
            <>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Write here…"
                placeholderTextColor={theme.textSecondary}
                multiline
                style={inputStyle}
              />
              <DictationButton
                onText={(text) => setDraft((d) => (d ? `${d} ${text}` : text))}
                onError={(m) => setError(m || null)}
              />
              <View style={styles.actionRow}>
                <View style={styles.flexOne}>
                  <Button
                    label="Save & continue"
                    busy={busy}
                    disabled={!draft.trim()}
                    onPress={savePrompt}
                  />
                </View>
                <View style={styles.flexOne}>
                  <Button label="Skip" kind="secondary" onPress={() => markAndAdvance()} />
                </View>
              </View>
            </>
          )}
        </Card>
      )}

      {/* Guided: all steps done */}
      {finishedSteps && (
        <Card style={styles.stepCard}>
          <ThemedText type="small">
            That’s the whole {guide!.title.toLowerCase()} — {completedRef.current.length} of{' '}
            {steps.length} steps done in {formatElapsed(elapsed)}. Stay as long as you like.
          </ThemedText>
          <Button label="End session" busy={busy} onPress={end} />
        </Card>
      )}

      {/* Freeform: the passage and an open pad, no prescribed order */}
      {!guide && (
        <>
          <Card style={styles.stepCard}>
            <SectionTitle>Today’s passage</SectionTitle>
            {daily ? (
              <PassageBlock daily={daily} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Loading today’s passage…
              </ThemedText>
            )}
          </Card>
          <Card style={styles.stepCard}>
            <SectionTitle>Journal</SectionTitle>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write what needs writing…"
              placeholderTextColor={theme.textSecondary}
              multiline
              style={inputStyle}
            />
            <DictationButton
              onText={(text) => setDraft((d) => (d ? `${d} ${text}` : text))}
              onError={(m) => setError(m || null)}
            />
            <Button
              label="Save entry"
              busy={busy}
              disabled={!draft.trim()}
              onPress={saveFreeform}
            />
            {savedCount > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {savedCount} {savedCount === 1 ? 'entry' : 'entries'} saved
              </ThemedText>
            )}
          </Card>
        </>
      )}

      <ThemedText type="small" themeColor="textSecondary">
        Music from another app keeps playing during a session — it dips while
        the narration speaks.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepCard: {
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  passageBlock: {
    gap: Spacing.one,
  },
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  passageText: {
    opacity: 0.9,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    minHeight: 120,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flexOne: {
    flex: 1,
  },
  error: {
    color: '#c94040',
  },
});
