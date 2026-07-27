import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReadingView from "@/components/ReadingView";
import { getPassages, getToc, getWorks } from "@/lib/corpus-server";
import { findWorkBySlug, workSlug } from "@/lib/library";

type Params = { params: Promise<{ slug: string; part: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, part } = await params;
  const work = findWorkBySlug(await getWorks(), slug);
  if (!work) return {};
  const entry = (await getToc(work.work)).find(
    (e) => e.part === decodeURIComponent(part),
  );
  if (!entry) return {};
  return {
    title: `${work.work} ${entry.label} — ${work.author} | A Stoic Mind`,
    description: `Read ${work.work}, ${entry.label}, by ${work.author} — free, in the public domain.`,
  };
}

export default async function PartPage({ params }: Params) {
  const { slug, part: rawPart } = await params;
  const part = decodeURIComponent(rawPart);
  const work = findWorkBySlug(await getWorks(), slug);
  if (!work) notFound();

  const toc = await getToc(work.work);
  const index = toc.findIndex((e) => e.part === part);
  if (index === -1) notFound();

  const passages = await getPassages(work.work, part);
  if (passages.length === 0) notFound();

  const base = `/library/${workSlug(work.work)}`;
  const toNav = (i: number) =>
    i >= 0 && i < toc.length
      ? { href: `${base}/${encodeURIComponent(toc[i].part)}`, label: toc[i].label }
      : null;

  return (
    <ReadingView
      work={work}
      label={toc[index].label}
      part={part}
      passages={passages}
      prev={toNav(index - 1)}
      next={toNav(index + 1)}
    />
  );
}
