import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StoicPortrait from "@/components/StoicPortrait";
import type { Work } from "@/lib/api";
import { getWorks } from "@/lib/corpus-server";
import { workSlug } from "@/lib/library";
import { CIRCLE_INTRO, findTranscendentalist } from "@/lib/transcendentalists";

// Request-time rendering, like the library pages: the works list comes from
// the backend, which is only reachable at runtime on Railway.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const person = findTranscendentalist(slug);
  if (!person) return {};
  return {
    title: `${person.name} — A Transcendental Mind`,
    description: `${person.name} (${person.dates}): ${person.epithet}. Their life, their teachings, and where to read them.`,
  };
}

export default async function TranscendentalistPage({ params }: Params) {
  const { slug } = await params;
  const person = findTranscendentalist(slug);
  if (!person) notFound();

  // The bio is checked-in content — a backend outage shouldn't take the
  // page down, so the works list degrades to absent instead of throwing.
  let works: Work[] = [];
  if (person.corpusAuthor) {
    try {
      works = (await getWorks("transcendentalism")).filter(
        (w) => w.author === person.corpusAuthor,
      );
    } catch {
      works = [];
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link
        href="/transcendentalists"
        className="mb-6 inline-block text-sm opacity-60 hover:opacity-100"
      >
        ← The Transcendentalists
      </Link>

      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end">
        <div className="relative aspect-[4/5] w-40 shrink-0 overflow-hidden rounded-lg bg-black/5 sm:w-44 dark:bg-white/10">
          <StoicPortrait subject={person} sizes="176px" priority />
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide opacity-50">
            {CIRCLE_INTRO.title} · {person.dates}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {person.name}
          </h1>
          {person.fullName && (
            <p className="mt-0.5 text-sm opacity-60">{person.fullName}</p>
          )}
          <p className="mt-2 max-w-md text-sm opacity-70">{person.epithet}</p>
        </div>
      </header>

      <blockquote className="mb-10 border-l-2 border-black/20 pl-4 dark:border-white/30">
        <p className="font-serif text-lg leading-relaxed">
          “{person.quote.text}”
        </p>
        <footer className="mt-2 text-sm opacity-60">
          —{" "}
          {person.quote.work ? (
            <Link
              href={`/library/${workSlug(person.quote.work)}`}
              className="underline decoration-black/30 underline-offset-2 hover:opacity-100 dark:decoration-white/40"
            >
              {person.quote.source}
            </Link>
          ) : (
            person.quote.source
          )}
        </footer>
      </blockquote>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">
          {person.slug === "fuller" ? "Her life" : "His life"}
        </h2>
        <div className="flex flex-col gap-4">
          {person.life.map((paragraph, i) => (
            <p key={i} className="text-[15px] leading-relaxed opacity-90">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">
          {person.slug === "fuller" ? "What she taught" : "What he taught"}
        </h2>
        <ul className="flex flex-col gap-3">
          {person.themes.map((theme) => (
            <li
              key={theme.title}
              className="rounded-lg border border-black/10 px-4 py-3 dark:border-white/15"
            >
              <p className="font-medium">{theme.title}</p>
              <p className="mt-1 text-sm leading-relaxed opacity-70">
                {theme.text}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">In the Library</h2>
        {works.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {works.map((w) => (
              <li key={w.work}>
                <Link
                  href={`/library/${workSlug(w.work)}`}
                  className="flex items-baseline justify-between gap-4 rounded-lg border border-black/10 px-4 py-3 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  <span className="font-medium">{w.work}</span>
                  <span className="shrink-0 text-xs opacity-60">
                    {w.passage_count} passages
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed opacity-70">
            Their works could not be loaded right now — find them on the
            Library page.
          </p>
        )}
      </section>

      {person.image && (
        <p className="border-t border-black/10 pt-4 text-xs opacity-50 dark:border-white/15">
          Portrait:{" "}
          <a
            href={person.image.creditUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {person.image.credit}
          </a>
        </p>
      )}
    </div>
  );
}
