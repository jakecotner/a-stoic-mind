"use client";

// The mentor — a conversation with a seasoned student of the Stoa. Streaming
// SSE chat over the reinstated chat module: conversation list on the left,
// thread on the right. The journal-sharing switch lives at the point of use
// (next to the composer): per conversation, off by default.
//
// LIVE mode is the voice loop: replies are narrated aloud, the mic stays
// open (dictation engine's live mode), and speaking — even over the mentor —
// stops the narration, transcribes the utterance, and sends it as the next
// message. Typing keeps working throughout; live is a layer, not a mode
// switch.
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  deleteConversation,
  fetchConversation,
  fetchConversations,
  messageAudioUrl,
  streamChat,
  updateConversation,
  type CapInfo,
  type ConversationSummary,
} from "@/lib/api";
import {
  getNarrationSnapshot,
  getServerNarrationSnapshot,
  primeAudio,
  startNarration,
  stopNarration,
  subscribeNarration,
} from "@/lib/narration";
import {
  getDictationSnapshot,
  getServerDictationSnapshot,
  startLiveDictation,
  subscribeDictation,
} from "@/lib/dictation";
import { useUser } from "@/lib/useUser";

interface LocalMessage {
  role: "user" | "assistant";
  content: string;
  /** Persisted id — known for loaded threads and for replies once their
      done event lands. What the listen button and live narration key on. */
  id?: string;
}

function speak(messageId: string) {
  startNarration(() => [
    { src: messageAudioUrl(messageId), passageId: messageId, kind: "reply" },
  ]);
}

export default function ChatPage() {
  const { user, loading } = useUser();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [shareJournal, setShareJournal] = useState(false);
  const [live, setLive] = useState(false);
  const [notice, setNotice] = useState<React.ReactNode>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const liveCleanup = useRef<(() => void) | null>(null);
  // An utterance that arrived while a reply was still streaming — sent as
  // soon as the stream settles.
  const pendingUtterance = useRef<string | null>(null);
  // The utterance handler is registered once with the dictation engine but
  // must see current state — route it through a ref updated every render.
  const sendRef = useRef<(text: string) => void>(() => {});

  const narration = useSyncExternalStore(
    subscribeNarration,
    getNarrationSnapshot,
    getServerNarrationSnapshot,
  );
  const dictation = useSyncExternalStore(
    subscribeDictation,
    getDictationSnapshot,
    getServerDictationSnapshot,
  );

  useEffect(() => {
    if (user) void fetchConversations().then(setConversations);
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Leaving the page ends live listening and any narration in flight.
  useEffect(
    () => () => {
      liveCleanup.current?.();
      liveCleanup.current = null;
      stopNarration();
    },
    [],
  );

  const openConversation = async (id: string) => {
    const detail = await fetchConversation(id);
    if (!detail) return;
    setActiveId(id);
    setNotice(null);
    setShareJournal(detail.share_journal);
    setMessages(
      detail.messages.map((m) => ({
        role: m.role,
        content: m.content,
        id: m.id,
      })),
    );
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setNotice(null);
    setShareJournal(false);
  };

  const toggleShareJournal = async () => {
    const next = !shareJournal;
    setShareJournal(next);
    if (activeId) {
      try {
        await updateConversation(activeId, next);
      } catch {
        setShareJournal(!next); // revert; the switch shows the truth
      }
    }
    // No active conversation yet: the choice rides along when the first
    // message creates one.
  };

  const toggleLive = () => {
    if (live) {
      liveCleanup.current?.();
      liveCleanup.current = null;
      stopNarration();
      setLive(false);
      return;
    }
    // The click is the user gesture that earns both the mic permission
    // prompt and the audio element's autoplay blessing.
    primeAudio();
    liveCleanup.current = startLiveDictation((text) => sendRef.current(text));
    setLive(true);
  };

  const capNotice = (info: CapInfo) =>
    info.scope === "anonymous" ? (
      <>
        That&apos;s the free taste for now —{" "}
        <Link href="/register" className="underline">
          create a free account
        </Link>{" "}
        to keep going.
      </>
    ) : (
      <>
        You&apos;ve used {info.used ?? "all"} of this month&apos;s{" "}
        {info.limit ?? ""} free turns —{" "}
        <Link href="/account" className="underline">
          upgrade to Plus
        </Link>{" "}
        for unlimited.
      </>
    );

  const sendMessage = async (message: string) => {
    if (!message || streaming) return;
    setNotice(null);
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);
    const append = (text: string) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content: next[next.length - 1].content + text,
        };
        return next;
      });
    await streamChat(
      message,
      activeId,
      {
        onMeta: ({ conversation_id }) => {
          setActiveId(conversation_id);
          if (user) void fetchConversations().then(setConversations);
        },
        onDelta: append,
        onError: (msg) => setNotice(msg),
        onCapHit: (info) => {
          // Drop the empty assistant bubble; the notice carries the nudge.
          setMessages((prev) => prev.slice(0, -1));
          setNotice(capNotice(info));
        },
        onDone: ({ message_id }) => {
          setStreaming(false);
          if (message_id) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant")
                next[next.length - 1] = { ...last, id: message_id };
              return next;
            });
            if (liveCleanup.current) speak(message_id);
          }
          const pending = pendingUtterance.current;
          pendingUtterance.current = null;
          if (pending) void sendRef.current(pending);
        },
      },
      shareJournal,
    );
  };

  // What a finished live utterance does — kept current across renders.
  sendRef.current = (text: string) => {
    if (streaming) {
      // The mentor is mid-reply; queue the thought for the next turn.
      pendingUtterance.current = pendingUtterance.current
        ? `${pendingUtterance.current} ${text}`
        : text;
      return;
    }
    void sendMessage(text);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    await sendMessage(message);
  };

  const liveChip = !live
    ? null
    : dictation.status === "recording"
      ? "● hearing you"
      : dictation.status === "transcribing"
        ? "understanding…"
        : narration.state === "playing" && narration.item?.kind === "reply"
          ? "speaking — talk to interrupt"
          : dictation.status === "denied"
            ? "mic blocked in the browser"
            : "listening";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 gap-6 px-4 py-6">
      {user && (
        <aside className="hidden w-56 shrink-0 flex-col gap-1 sm:flex">
          <button
            onClick={newChat}
            className="mb-2 rounded-lg border border-black/15 px-3 py-1.5 text-left text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            + New chat
          </button>
          {conversations.map((c) => (
            <div key={c.id} className="group flex items-center gap-1">
              <button
                onClick={() => void openConversation(c.id)}
                className={`flex-1 truncate rounded px-2 py-1 text-left text-sm ${
                  c.id === activeId
                    ? "bg-black/10 dark:bg-white/15"
                    : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {c.title ?? "Untitled"}
              </button>
              <button
                aria-label="Delete conversation"
                className="hidden px-1 text-xs opacity-50 hover:opacity-100 group-hover:block"
                onClick={async () => {
                  await deleteConversation(c.id);
                  setConversations((prev) => prev.filter((x) => x.id !== c.id));
                  if (c.id === activeId) newChat();
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.length === 0 && (
            <p className="pt-16 text-center text-sm opacity-60">
              {loading
                ? ""
                : user
                  ? "Ask the mentor anything — it knows today's passage."
                  : "The mentor is for members — sign in (free) to talk."}
            </p>
          )}
          {messages.map((m, i) => {
            const speaking =
              m.id != null && narration.item?.src === messageAudioUrl(m.id);
            return (
              <div
                key={i}
                className={`group/bubble relative max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-foreground text-background"
                    : "bg-black/5 dark:bg-white/10"
                }`}
              >
                {m.content ||
                  (streaming && i === messages.length - 1 ? "…" : "")}
                {m.role === "assistant" && m.id && (
                  <button
                    aria-label={
                      speaking ? "Stop narration" : "Listen to this reply"
                    }
                    title={speaking ? "Stop" : "Listen"}
                    onClick={() => (speaking ? stopNarration() : speak(m.id!))}
                    className={`absolute -right-7 top-2 text-xs opacity-0 transition-opacity hover:!opacity-100 focus:opacity-70 group-hover/bubble:opacity-50 ${
                      speaking ? "!opacity-70" : ""
                    }`}
                  >
                    {speaking ? "■" : "▶"}
                  </button>
                )}
              </div>
            );
          })}
          {notice && (
            <p className="rounded-lg border border-black/15 px-4 py-2.5 text-sm opacity-80 dark:border-white/20">
              {notice}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-black/10 pt-3 dark:border-white/15">
          {user && (
            <div className="mb-2 flex flex-wrap items-center gap-4">
              <label
                className="flex w-fit cursor-pointer items-center gap-2 text-xs opacity-70 hover:opacity-100"
                title="Only in this conversation, only while switched on. The mentor never sees your journal otherwise."
              >
                <input
                  type="checkbox"
                  checked={shareJournal}
                  onChange={toggleShareJournal}
                  className="accent-current"
                />
                Let the mentor read my recent journal entries
              </label>
              <button
                onClick={toggleLive}
                title={
                  live
                    ? "End the voice conversation"
                    : "Talk with the mentor — replies are spoken, and the mic stays open"
                }
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                  live
                    ? "border-black/40 font-medium dark:border-white/60"
                    : "border-black/15 opacity-70 hover:opacity-100 dark:border-white/20"
                }`}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    live
                      ? dictation.status === "recording"
                        ? "animate-pulse bg-red-500"
                        : "bg-green-500"
                      : "bg-black/30 dark:bg-white/30"
                  }`}
                />
                {live ? `Live: ${liveChip}` : "Go live"}
              </button>
            </div>
          )}
          <form onSubmit={send} className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
              placeholder={live ? "Speak, or type…" : "Say something…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              className="rounded-lg bg-foreground px-4 py-2 font-medium text-background hover:opacity-85 disabled:opacity-50"
              disabled={streaming || !input.trim()}
            >
              Send
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
