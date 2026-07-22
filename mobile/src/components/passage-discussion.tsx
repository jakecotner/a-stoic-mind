import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MarkdownLite } from '@/components/markdown-lite';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchConversation, fetchPassageThread, streamChat } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { ChatMessage } from '@/lib/types';

/** A discussion thread anchored to the visible passage (Stoa Plus) —
    mirrors the web reading pane. Mounted with key={passageId} so state
    resets on page turn. Hidden on free accounts (mobile doesn't sell the
    plan, so it doesn't tease it). The thread is seeded server-side with the
    passage + its breakdown. */
export function PassageDiscussion({ passageId }: { passageId: number }) {
  const { user, isPlus } = useAuth();
  const theme = useTheme();
  // undefined = still checking whether a thread exists.
  const [threadId, setThreadId] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    const lookup =
      user && isPlus ? fetchPassageThread(passageId) : Promise.resolve(null);
    lookup.then((id) => {
      if (!cancelled) setThreadId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [passageId, user, isPlus]);

  const updateLast = (patch: (m: ChatMessage) => ChatMessage) =>
    setMsgs((ms) => [...ms.slice(0, -1), patch(ms[ms.length - 1])]);

  async function openExisting() {
    setOpen(true);
    if (msgs.length > 0 || !threadId) return;
    const c = await fetchConversation(threadId);
    if (!c) return;
    let ms: ChatMessage[] = c.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    // Hide the seed (the passage quote + breakdown) — it's already on screen.
    if (ms[0]?.role === 'assistant' && ms[0].content.startsWith('> ')) {
      ms = ms.slice(1);
    }
    setMsgs(ms);
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setBusy(true);
    const starting = !threadId;
    setMsgs((ms) => [
      ...ms,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ]);
    try {
      await streamChat(
        text,
        threadId ?? null,
        {
          onMeta: (meta) => setThreadId(meta.conversation_id),
          onDelta: (d) => updateLast((m) => ({ ...m, content: m.content + d })),
          onError: (error) => updateLast((m) => ({ ...m, error })),
          onDone: () => {},
        },
        starting ? { passageId } : {},
      );
    } finally {
      setBusy(false);
    }
  }

  if (!user || !isPlus || threadId === undefined) return null;

  if (!open) {
    return (
      <Pressable onPress={() => (threadId ? openExisting() : setOpen(true))}>
        <ThemedText type="linkPrimary">
          {threadId ? 'Continue the discussion' : 'Discuss with the Stoa'}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={styles.thread}>
      <Pressable onPress={() => setOpen(false)}>
        <ThemedText type="linkPrimary">Hide discussion</ThemedText>
      </Pressable>

      {msgs.map((m, i) =>
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

      {busy && msgs[msgs.length - 1]?.content === '' && (
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
          placeholder={
            msgs.length === 0
              ? 'What does this passage stir up?'
              : 'Continue the discussion…'
          }
          placeholderTextColor={theme.textSecondary}
          multiline
          value={draft}
          onChangeText={setDraft}
          editable={!busy}
        />
        <Pressable
          style={[
            styles.sendButton,
            { backgroundColor: theme.text },
            (busy || !draft.trim()) && styles.disabled,
          ]}
          onPress={send}
          disabled={busy || !draft.trim()}>
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
