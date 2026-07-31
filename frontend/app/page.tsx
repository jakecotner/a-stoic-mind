import type { Metadata } from "next";
import JournalView from "@/components/JournalView";
import type { Daily } from "@/lib/api";

// The journal — also the landing page: today's passage, its reflection, and
// the journal pad, with day-by-day browsing for signed-in users.
// A server component — the passage text is in the HTML search engines see.
// Server code can't use the /api rewrite (that's the browser-facing proxy),
// so it talks to the backend origin directly, like lib/auth-server.ts.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

// Rendered at request time: the backend is only reachable at runtime (on
// Railway the private network doesn't exist during builds), and a static
// prerender would bake the "passage unavailable" fallback into the page.
// The daily lookup is one indexed query — the LLM breakdown is cached in
// the backend's passage_breakdowns table.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description:
    "A Stoic Mind — read a hand-picked passage from the Stoic classics each day, with a grounded reflection, and keep a journal alongside your practice.",
};

/** Today's passage, or null when the backend is unreachable — the page
    renders a quiet fallback rather than erroring. */
async function getDaily(): Promise<Daily | null> {
  try {
    const resp = await fetch(`${API_URL}/api/daily`, {
      next: { revalidate: 300 },
    });
    if (!resp.ok) return null;
    return (await resp.json()) as Daily;
  } catch {
    return null;
  }
}

export default async function JournalPage() {
  const daily = await getDaily();
  return <JournalView daily={daily} />;
}
