// Server-side corpus fetches for the library pages. Server code can't use
// the /api rewrite (that's the browser-facing proxy), so this talks to the
// backend origin directly — same pattern as lib/auth-server.ts. The corpus
// is immutable, so an hour of caching is safe.
import type { Passage, TocPart, Work } from "./api";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";
const CACHED = { next: { revalidate: 3600 } };

/** The works listing; `tradition` narrows to one tradition's shelf,
    unfiltered returns the whole corpus (used to resolve work slugs, which
    are tradition-independent). */
export async function getWorks(tradition?: string): Promise<Work[]> {
  const arg = tradition ? `?tradition=${encodeURIComponent(tradition)}` : "";
  const resp = await fetch(`${API_URL}/api/works${arg}`, CACHED);
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
