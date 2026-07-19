export interface Source {
  id: number;
  author: string;
  work: string;
  reference: string;
  translator: string;
  text: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: string;
}
