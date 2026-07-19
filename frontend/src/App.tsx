import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { fetchDaily, streamChat } from "./api";
import type { ChatMessage, Source } from "./types";
import "./App.css";

function SourcePanel({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <details className="sources">
      <summary>
        Grounded in {sources.length} passage{sources.length > 1 ? "s" : ""}
      </summary>
      {sources.map((s) => (
        <blockquote key={s.id} className="source-card">
          <div className="source-ref">
            {s.reference} <span className="source-trans">· {s.author}, trans. {s.translator}</span>
          </div>
          <p>{s.text.length > 420 ? s.text.slice(0, 420) + "…" : s.text}</p>
        </blockquote>
      ))}
    </details>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return <div className="msg msg-user">{message.content}</div>;
  }
  return (
    <div className="msg msg-assistant">
      {message.sources && <SourcePanel sources={message.sources} />}
      <div className="msg-body">
        <Markdown>{message.content}</Markdown>
      </div>
      {message.error && <div className="msg-error">{message.error}</div>}
    </div>
  );
}

function DailyQuote({ quote }: { quote: Source }) {
  return (
    <figure className="daily">
      <blockquote>{quote.text}</blockquote>
      <figcaption>
        — {quote.author}, {quote.reference}
      </figcaption>
    </figure>
  );
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [daily, setDaily] = useState<Source | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDaily().then(setDaily);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const updateLast = (patch: (m: ChatMessage) => ChatMessage) =>
    setMessages((ms) => [...ms.slice(0, -1), patch(ms[ms.length - 1])]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMessages((ms) => [
      ...ms,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    try {
      await streamChat(text, conversationId, {
        onMeta: (meta) => {
          setConversationId(meta.conversation_id);
          updateLast((m) => ({ ...m, sources: meta.sources }));
        },
        onDelta: (delta) => updateLast((m) => ({ ...m, content: m.content + delta })),
        onError: (error) => updateLast((m) => ({ ...m, error })),
        onDone: () => {},
      });
    } catch (err) {
      updateLast((m) => ({ ...m, error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="page">
      <header className="masthead">
        <h1>A Stoic Mind</h1>
        <p className="tagline">Ancient practice for present problems</p>
      </header>

      <main className={empty ? "chat chat-empty" : "chat"}>
        {empty && daily && <DailyQuote quote={daily} />}
        {empty && (
          <p className="intro">
            Describe something you're struggling with, or a way you're trying to
            grow. Responses draw on the actual writings of Epictetus, Marcus
            Aurelius, and Seneca — cited so you can read the originals.
          </p>
        )}
        {messages.map((m, i) => (
          <MessageView key={i} message={m} />
        ))}
        {busy && messages[messages.length - 1]?.content === "" && (
          <div className="thinking">Consulting the Stoics&hellip;</div>
        )}
        <div ref={endRef} />
      </main>

      <footer className="composer-wrap">
        <div className="composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="What is on your mind?"
            rows={2}
            disabled={busy}
          />
          <button onClick={send} disabled={busy || !input.trim()}>
            Send
          </button>
        </div>
        <p className="disclaimer">
          A philosophical practice tool, not therapy or medical care. In crisis?
          Call or text 988 (US) or your local emergency services.
        </p>
      </footer>
    </div>
  );
}
