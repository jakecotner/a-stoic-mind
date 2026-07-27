// Server-side corpus fetches for the library pages. Server code can't use
// the /api rewrite (that's the browser-facing proxy), so this talks to the
// backend origin directly — same pattern as lib/auth-server.ts. The corpus
// is immutable, so an hour of caching is safe.
import type { Passage, TocPart, Work } from "./api";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";
const CACHED = { next: { revalidate: 3600 } };

export async function getWorks(): Promise<Work[]> {
  const resp = await fetch(`${API_URL}/api/works`, CACHED);
  if (!resp.ok) throw new Error(`Could not load the library (${resp.status})`);
  return resp.json();
}

export async function getToc(work: string): Promise<TocPart[]> {
  const resp = await fetch(
    `${API_URL}/api/works/toc?work=${encodeURIComponent(work)}`,
    CACHED,
  );
  if (!resp.ok) throw new Error(`Could not load ${work} (${resp.status})`);
  return resp.json();
}

export async function getPassages(
  work: string,
  part?: string,
): Promise<Passage[]> {
  const partArg = part ? `&part=${encodeURIComponent(part)}` : "";
  const resp = await fetch(
    `${API_URL}/api/passages?work=${encodeURIComponent(work)}${partArg}`,
    CACHED,
  );
  if (resp.status === 404) return [];
  if (!resp.ok) throw new Error(`Could not load ${work} (${resp.status})`);
  return resp.json();
}
