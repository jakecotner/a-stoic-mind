import type { Metadata } from "next";
import Link from "next/link";
import { getWorks } from "@/lib/corpus-server";
import { workSlug } from "@/lib/library";

// Rendered at request time: the backend is only reachable at runtime (on
// Railway the private network doesn't exist during builds). Note
// force-dynamic also bypasses the fetch cache in lib/corpus-server.ts —
// each request re-queries the backend, which is a cheap indexed read.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Library — A Stoic Mind",
  description:
    "The Stoic classics, free to read: Marcus Aurelius' Meditations, Epictetus' Discourses and Enchiridion, Seneca's letters and essays, and the Lectures of Musonius Rufus — with the original Greek and Latin where available.",
};

export default async function LibraryPage() {
  const works = await getWorks();
  const authors = [...new Set(works.map((w) => w.author))];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Library</h1>
      <p className="mb-8 text-sm opacity-70">
        The Stoic classics, free to read. Open a work to read
        it — signed in, you can take margin notes and keep your reading in
        your practice calendar.
      </p>
      {authors.map((author) => (
        <section key={author} className="mb-8">
          <h2 className="mb-3 text-lg font-medium">{author}</h2>
          <ul className="flex flex-col gap-2">
            {works
              .filter((w) => w.author === author)
              .map((w) => (
                <li key={w.work}>
                  <Link
                    href={`/library/${workSlug(w.work)}`}
                    className="flex items-baseline justify-between gap-4 rounded-lg border border-black/10 px-4 py-3 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  >
                    <span className="font-medium">{w.work}</span>
                    <span className="shrink-0 text-xs opacity-60">
                      {w.passage_count} passages
                      {w.original_language &&
                        ` · ${w.original_language === "grc" ? "Greek" : "Latin"} original`}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
