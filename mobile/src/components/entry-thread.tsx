import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MarkdownLite } from '@/components/markdown-lite';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchConversation, streamChat } from '@/lib/api';
import type { ChatMessage, Note } from '@/lib/types';

/** The conversation anchored beneath a journal entry (mirrors the web app's
    EntryThread). The entry itself is the thread's first user message, so only
    what follows it is rendered here. */
export function EntryThread({
  note,
  seedPassageId,
  autoStart,
  onThreadKnown,
}: {
  note: Note;
  /** Passage context baked into a NEW thread (daily prompt or margin note). */
  seedPassageId: number | null;
  autoStart: boolean;
  onThreadKnown: (noteId: string, threadId: string) => void;
}) {
  const theme = useTheme();
  const [threadId, setThreadId] = useState<string | null>(note.thread_id);
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const started = useRef(false);

  const updateLast = (patch: (m: ChatMessage) => ChatMessage) =>
    setMsgs((ms) => ms && [...ms.slice(0, -1), patch(ms[ms.length - 1])]);

  const startThread = useCallback(() => {
    if (started.current || threadId) return;
    started.current = true;
    setOpen(true);
    setBusy(true);
    setMsgs([{ role: 'assistant', content: '' }]);
    streamChat(
      note.content,
      null,
      {
        onMeta: (meta) => {
          setThreadId(meta.conversation_id);
          onThreadKnown(note.id, meta.conversation_id);
        },
        onDelta: (d) => updateLast((m) => ({ ...m, content: m.content + d })),
        onError: (error) => updateLast((m) => ({ ...m, error })),
        onDone: () => setBusy(false),
      },
      { seedPassageId, noteId: note.id },
    ).catch(() => setBusy(false));
  }, [note, threadId, seedPassageId, onThreadKnown]);

  useEffect(() => {
    if (autoStart) startThread();
  }, [autoStart, startThread]);

  const openExisting = useCallback(async () => {
    setOpen(true);
    if (msgs !== null || !threadId) return;
    const c = await fetchConversation(threadId);
    if (!c) return;
    let ms: ChatMessage[] = c.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    // Hide the passage seed and the entry's own text (already shown above).
    if (ms[0]?.role === 'assistant' && ms[0].content.startsWith('> ')) {
      ms = ms.slice(1);
    }
    if (ms[0]?.role === 'user') ms = ms.slice(1);
    setMsgs(ms);
  }, [msgs, threadId]);

  async function followUp() {
    const text = draft.trim();
    if (!text || busy || !threadId) return;
    setDraft('');
    setBusy(true);
    setMsgs((ms) => [
      ...(ms ?? []),
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ]);
    try {
      await streamChat(text, threadId, {
        onMeta: () => {},
        onDelta: (d) => updateLast((m) => ({ ...m, content: m.content + d })),
        onError: (error) => updateLast((m) => ({ ...m, error })),
        onDone: () => {},
      });
    } finally {
      setBusy(false);
    }
  }

  if (!threadId && !started.current) {
    return (
      <Pressable onPress={startThread}>
        <ThemedText type="linkPrimary">Reflect with the Stoa</ThemedText>
      </Pressable>
    );
  }

  if (!open) {
    return (
      <Pressable onPress={openExisting}>
        <ThemedText type="linkPrimary">Show reflection</ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={styles.thread}>
      <Pressable onPress={() => setOpen(false)}>
        <ThemedText type="linkPrimary">Hide reflection</ThemedText>
      </Pressable>

      {(msgs ?? []).map((m, i) =>
        m.role === 'user' ? (
          <ThemedView key={i} type="backgroundSelected" style={styles.userMsg}>
            <ThemedText type="small">{m.content}</ThemedText>
          </ThemedView>
        ) : (
          <View key={i} style={styles.assistantMsg}>
            {m.content !== '' && <MarkdownLite>{m.content}</MarkdownLite>}
            {m.error && (
              <ThemedText type="small" style={styles.error}>
                {m.error}
              </ThemedText>
            )}
          </View>
        ),
      )}

      {busy && msgs && msgs[msgs.length - 1]?.content === '' && (
        <View style={styles.thinking}>
          <ActivityIndicator size="small" color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Consulting the Stoics…
          </ThemedText>
        </View>
      )}

      <View style={styles.composer}>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.backgroundElement, color: theme.text },
          ]}
          placeholder="Continue the reflection…"
          placeholderTextColor={theme.textSecondary}
          multiline
          value={draft}
          onChangeText={setDraft}
          editable={!busy && !!threadId}
        />
        <Pressable
          style={[
            styles.sendButton,
            { backgroundColor: theme.text },
            (busy || !draft.trim() || !threadId) && styles.disabled,
          ]}
          onPress={followUp}
          disabled={busy || !draft.trim() || !threadId}>
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            Send
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  thread: {
    gap: Spacing.three,
  },
  userMsg: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  assistantMsg: {
    gap: Spacing.two,
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  composer: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    borderRadius: Spacing.two,
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
  },
  disabled: {
    opacity: 0.4,
  },
  error: {
    color: '#d33',
  },
});
