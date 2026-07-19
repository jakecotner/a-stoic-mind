import type { Source } from "./types";

export interface StreamHandlers {
  onMeta: (meta: { conversation_id: string; sources: Source[] }) => void;
  onDelta: (text: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

/** POST /api/chat and consume the SSE response. */
export async function streamChat(
  message: string,
  conversationId: string | null,
  handlers: StreamHandlers,
): Promise<void> {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      conversation_id: conversationId ?? undefined,
    }),
  });
  if (!resp.ok || !resp.body) {
    handlers.onError(`Request failed (${resp.status})`);
    handlers.onDone();
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleBlock = (block: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
    }
    if (dataLines.length === 0) return;
    const data = JSON.parse(dataLines.join("\n"));
    if (event === "meta") handlers.onMeta(data);
    else if (event === "error") handlers.onError(data.error);
    else if (event === "done") handlers.onDone();
    else handlers.onDelta(data); // default event: a text delta (JSON string)
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (block.trim()) handleBlock(block);
    }
  }
}

export async function fetchDaily(): Promise<Source | null> {
  const resp = await fetch("/api/daily");
  if (!resp.ok) return null;
  return resp.json();
}
