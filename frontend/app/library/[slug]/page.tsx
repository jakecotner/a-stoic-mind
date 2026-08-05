import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReadingView from "@/components/ReadingView";
import { getPassages, getToc, getWorks } from "@/lib/corpus-server";
import { findWorkBySlug, workSlug } from "@/lib/library";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const work = findWorkBySlug(await getWorks(), slug);
  if (!work) return {};
  return {
    title: `${work.work} — ${work.author} | A Stoic Mind`,
    description: work.translator
      ? `Read ${work.work} by ${work.author}, translated by ${work.translator} — free to read online.`
      : `Read ${work.work} by ${work.author} — free to read online.`,
  };
}

export default async function WorkPage({ params }: Params) {
  const { slug } = await params;
  const work = findWorkBySlug(await getWorks(), slug);
  if (!work) notFound();
  const toc = await getToc(work.work);

  // Works read whole (Enchiridion, the single-book essays) skip the TOC and
  // go straight to the text.
  if (toc.length === 1 && toc[0].part === "") {
    const passages = await getPassages(work.work);
    return <ReadingView work={work} label={null} part="" passages={passages} />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="text-sm opacity-60">{work.author}</p>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{work.work}</h1>
      <p className="mb-8 text-sm opacity-60">
        {work.translator ? `translated by ${work.translator}` : " "}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {toc.map((entry) => (
          <li key={entry.part}>
            <Link
              href={`/library/${workSlug(work.work)}/${encodeURIComponent(entry.part)}`}
              className="flex items-baseline justify-between gap-4 rounded-lg border border-black/10 px-4 py-3 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              <span>{entry.label}</span>
              <span className="shrink-0 text-xs opacity-60">
                {entry.passage_count}p
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
