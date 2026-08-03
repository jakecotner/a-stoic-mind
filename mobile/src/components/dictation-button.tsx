// Record → transcribe → hand the text to the caller. Extracted from the
// journal screen so a practice session's prompt steps can be dictated too.
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useState } from 'react';

import { Button } from '@/components/ui';
import { transcribeDictation } from '@/lib/api';
import { stopNarration } from '@/lib/narration';

export function DictationButton({
  onText,
  onError,
}: {
  onText: (text: string) => void;
  onError: (message: string) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'transcribing'>('idle');

  async function start() {
    onError('');
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    if (!granted) {
      onError('Microphone access is needed to dictate — enable it in Settings.');
      return;
    }
    // Recording and narration can't share the session.
    stopNarration();
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch {
      onError('Could not start recording.');
      setPhase('idle');
    }
  }

  async function finish() {
    setPhase('transcribing');
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri) throw new Error('The recording could not be read.');
      const text = await transcribeDictation(uri);
      if (text) onText(text);
      else onError('Nothing was recognized — try speaking a little longer.');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not transcribe the recording.');
    } finally {
      setPhase('idle');
    }
  }

  if (phase === 'recording')
    return <Button label="■ Stop dictating" kind="danger" onPress={finish} />;
  return (
    <Button
      label={phase === 'transcribing' ? 'Transcribing…' : '🎙 Dictate'}
      kind="secondary"
      busy={phase === 'transcribing'}
      onPress={start}
    />
  );
}
