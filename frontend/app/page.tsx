import type { Metadata } from "next";
import JournalPad from "@/components/JournalPad";
import type { Daily } from "@/lib/api";

// The landing page: today's passage, its reflection, and the journal pad.
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

/** The breakdown arrives as light markdown (bold **headings**). Render it
    as paragraphs with bold spans — no markdown library for two markers. */
function Reflection({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed opacity-90">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j}>{part.slice(2, -2)}</strong>
            ) : (
              <span key={j}>{part}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

export default async function LandingPage() {
  const daily = await getDaily();

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-10 lg:grid-cols-2">
      {/* Left: the daily passage, reflection beneath it */}
      <div className="flex flex-col gap-8">
        {daily ? (
          <article>
            <p className="mb-1 text-sm font-medium uppercase tracking-wide opacity-60">
              Today&apos;s passage
            </p>
            <h1 className="mb-4 text-2xl font-semibold tracking-tight">
              {daily.passage.reference}
            </h1>
            <blockquote className="whitespace-pre-line text-lg leading-relaxed">
              {daily.passage.text}
            </blockquote>
            <p className="mt-4 text-sm opacity-60">
              {daily.passage.author}, <em>{daily.passage.work}</em> &middot;
              translated by {daily.passage.translator}
            </p>
          </article>
        ) : (
          <article>
            <h1 className="mb-4 text-2xl font-semibold tracking-tight">
              A Stoic Mind
            </h1>
            <p className="text-lg opacity-75">
              A hand-picked passage from the Stoic classics every day, with a
              grounded reflection — and a journal to write alongside it.
              Today&apos;s passage is unavailable right now; try again in a
              moment.
            </p>
          </article>
        )}

        {daily && (
          <section className="border-t border-black/10 pt-6 dark:border-white/15">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide opacity-60">
              Reflection
            </h2>
            {daily.breakdown ? (
              <Reflection text={daily.breakdown} />
            ) : (
              <p className="text-sm opacity-60">
                Today&apos;s reflection isn&apos;t available right now — the
                passage stands on its own.
              </p>
            )}
          </section>
        )}
      </div>

      {/* Right: the journal pad */}
      <div className="lg:border-l lg:border-black/10 lg:pl-8 dark:lg:border-white/15">
        <JournalPad passageId={daily?.passage.id ?? null} />
      </div>
    </div>
  );
}
