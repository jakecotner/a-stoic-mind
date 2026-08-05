"use client";

// The mentor — a conversation with a seasoned student of the Stoa. Streaming
// SSE chat over the reinstated chat module. History lives in the nav
// sidebar's Mentor dropdown; the open thread is addressed by the URL
// (?c=<conversation id>), so history entries are plain links and
// back/forward work. The journal-sharing switch lives at the point of use
// (next to the composer): per conversation, off by default.
//
// LIVE mode is the voice loop: replies are narrated aloud, the mic stays
// open (dictation engine's live mode), and speaking — even over the mentor —
// stops the narration, transcribes the utterance, and sends it as the next
// message. Typing keeps working throughout; live is a layer, not a mode
// switch.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  fetchConversation,
  messageAudioUrl,
  narrateSnippet,
  streamChat,
  updateConversation,
  type CapInfo,
} from "@/lib/api";
import { CONVERSATIONS_CHANGED_EVENT } from "@/components/Sidebar";
import {
  appendLiveClip,
  finishLiveReply,
  getNarrationSnapshot,
  getServerNarrationSnapshot,
  getVoicePref,
  primeAudio,
  startLiveReply,
  startNarration,
  stopIfOwner,
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

// --- Live-mode reply narration: speak the reply sentence-by-sentence WHILE
// it streams, instead of waiting for the full text and one big synthesis.
// Text deltas are cut at sentence boundaries; each cut is synthesized the
// moment it's complete and appended to an open-ended narration run, so the
// mentor's first sentence is audible while the rest is still being written.

// A sentence end (., !, ?, optionally inside quotes/brackets) followed by
// whitespace — or a line break (paragraphs, list items). Numbers like "2.5"
// don't match (no space after the dot).
const SENTENCE_BOUNDARY = /[.!?]["'")\]]*\s+|\n+/g;
// After the first clip is on its way, batch sentences up to roughly this
// size — fewer, smoother clips once latency no longer depends on them.
const BATCH_CHARS = 160;
// The server refuses snippets over 1500 chars; split well before that.
const HARD_SPLIT = 1200;

type ReplyPipeline = {
  push: (delta: string) => void;
  finish: () => void;
  /** Abort the run (error / cap hit) — stops audio if we still own it. */
  cancel: () => void;
  /** Free the clip object URLs — only after the run is long over. */
  dispose: () => void;
};

function createReplyPipeline(): ReplyPipeline {
  const token = startLiveReply();
  const voice = getVoicePref();
  const urls: string[] = [];
  // Clips must reach the queue in reply order, but synthesis runs in
  // parallel: each flush starts its fetch immediately and the chain only
  // orders the appends.
  let chain: Promise<void> = Promise.resolve();
  let buffer = ""; // text since the last cut, no boundary seen yet
  let pending = ""; // complete sentences held back for batching
  let sentAny = false;

  const send = (piece: string) => {
    const text = piece.trim();
    if (!text) return;
    sentAny = true;
    const fetching = narrateSnippet(text, voice);
    chain = chain.then(async () => {
      try {
        const url = URL.createObjectURL(await fetching);
        urls.push(url);
        appendLiveClip(token, url, "live-reply");
      } catch {
        // Skip this clip; the next keeps the reply going. The text is
        // still on screen, so nothing is lost.
      }
    });
  };

  const flushPending = () => {
    while (pending.length > HARD_SPLIT) {
      send(pending.slice(0, HARD_SPLIT));
      pending = pending.slice(HARD_SPLIT);
    }
    send(pending);
    pending = "";
  };

  return {
    push(delta) {
      buffer += delta;
      SENTENCE_BOUNDARY.lastIndex = 0;
      let cut = 0;
      for (let m = SENTENCE_BOUNDARY.exec(buffer); m; m = SENTENCE_BOUNDARY.exec(buffer))
        cut = m.index + m[0].length;
      if (cut === 0) return;
      pending += buffer.slice(0, cut);
      buffer = buffer.slice(cut);
      // The first sentence goes out the instant it's complete — it alone
      // decides how soon the mentor is audible. Later ones batch.
      if (!sentAny || pending.length >= BATCH_CHARS) flushPending();
    },
    finish() {
      pending += buffer;
      buffer = "";
      flushPending();
      void chain.then(() => finishLiveReply(token));
    },
    cancel() {
      stopIfOwner(token);
    },
    dispose() {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.length = 0;
    },
  };
}

function Chat() {
  const { user, loading } = useUser();
  const router = useRouter();
  const urlId = useSearchParams().get("c");
  const [activeId, setActiveId] = useState<string | null>(null);
  // The conversation the page state currently reflects — set synchronously
  // (unlike activeId) so the URL-sync effect below can tell a navigation
  // apart from its own router.replace echo.
  const loadedId = useRef<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [shareJournal, setShareJournal] = useState(false);
  const [live, setLive] = useState(false);
  const [notice, setNotice] = useState<React.ReactNode>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const liveCleanup = useRef<(() => void) | null>(null);
  // The previous reply's narration pipeline — kept only so its clip URLs
  // can be freed once a new reply (or unmount) has retired the run.
  const lastPipeline = useRef<ReplyPipeline | null>(null);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Leaving the page ends live listening and any narration in flight.
  useEffect(
    () => () => {
      liveCleanup.current?.();
      liveCleanup.current = null;
      stopNarration();
      lastPipeline.current?.dispose();
      lastPipeline.current = null;
    },
    [],
  );

  // The URL owns which conversation is open: sidebar history entries and
  // "+ New chat" are links here, so navigation loads the thread and /chat
  // with no ?c= resets to a fresh chat.
  useEffect(() => {
    if (urlId === loadedId.current) return;
    loadedId.current = urlId;
    if (!urlId) {
      setActiveId(null);
      setMessages([]);
      setNotice(null);
      setShareJournal(false);
      return;
    }
    void fetchConversation(urlId).then((detail) => {
      if (!detail) return; // gone or not ours — leave the page as-is
      setActiveId(urlId);
      setNotice(null);
      setShareJournal(detail.share_journal);
      setMessages(
        detail.messages.map((m) => ({
          role: m.role,
          content: m.content,
          id: m.id,
        })),
      );
    });
  }, [urlId]);

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
    // In live mode the reply is spoken sentence-by-sentence as it streams.
    // Starting the pipeline retires any run still playing, so the previous
    // reply's clips are safe to free now.
    let pipeline: ReplyPipeline | null = null;
    if (liveCleanup.current) {
      pipeline = createReplyPipeline();
      lastPipeline.current?.dispose();
      lastPipeline.current = pipeline;
    }
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
          if (user) {
            // Put the new conversation in the URL (without reloading the
            // thread we're mid-stream on) and let the sidebar refetch.
            loadedId.current = conversation_id;
            router.replace(`/chat?c=${conversation_id}`, { scroll: false });
            window.dispatchEvent(new Event(CONVERSATIONS_CHANGED_EVENT));
          }
          // Anonymous taste: the conversation continues in memory only.
        },
        onDelta: (text) => {
          append(text);
          pipeline?.push(text);
        },
        onError: (msg) => {
          pipeline?.cancel();
          setNotice(msg);
        },
        onCapHit: (info) => {
          pipeline?.cancel();
          // Drop the empty assistant bubble; the notice carries the nudge.
          setMessages((prev) => prev.slice(0, -1));
          setNotice(capNotice(info));
        },
        onDone: ({ message_id }) => {
          setStreaming(false);
          pipeline?.finish();
          if (message_id) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant")
                next[next.length - 1] = { ...last, id: message_id };
              return next;
            });
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
    <div className="mx-auto flex w-full max-w-3xl flex-1 gap-6 px-4 py-6">
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

// useSearchParams needs a Suspense boundary on prerendered routes; the
// fallback is never visible in practice (the page is client-rendered).
export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <Chat />
    </Suspense>
  );
}
