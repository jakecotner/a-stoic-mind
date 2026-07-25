"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  deleteConversation,
  fetchConversation,
  fetchConversations,
  streamChat,
  type CapInfo,
  type ConversationSummary,
} from "@/lib/api";
import { useUser } from "@/lib/useUser";

interface LocalMessage {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const { user, loading } = useUser();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<React.ReactNode>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) void fetchConversations().then(setConversations);
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openConversation = async (id: string) => {
    const detail = await fetchConversation(id);
    if (!detail) return;
    setActiveId(id);
    setNotice(null);
    setMessages(
      detail.messages.map((m) => ({ role: m.role, content: m.content })),
    );
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setNotice(null);
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

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
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
          role: "assistant",
          content: next[next.length - 1].content + text,
        };
        return next;
      });
    await streamChat(message, activeId, {
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
      onDone: () => setStreaming(false),
    });
  };

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
                  ? "Start a conversation."
                  : "You can chat without an account — sign in to keep your history."}
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-foreground text-background"
                  : "bg-black/5 dark:bg-white/10"
              }`}
            >
              {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
            </div>
          ))}
          {notice && (
            <p className="rounded-lg border border-black/15 px-4 py-2.5 text-sm opacity-80 dark:border-white/20">
              {notice}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={send} className="flex gap-2 border-t border-black/10 pt-4 dark:border-white/15">
          <input
            className="flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            placeholder="Say something…"
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
      </section>
    </div>
  );
}
