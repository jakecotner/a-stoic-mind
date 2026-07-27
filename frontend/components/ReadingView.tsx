// The reading surface, shared by whole-work pages and part pages. A server
// component: the passage text is in the HTML search engines index. The
// signed-in layer (margin notes, mark-as-read) comes from the client
// islands in components/Reader.tsx.
import Link from "next/link";
import type { Passage, Work } from "@/lib/api";
import {
  AnnotationsProvider,
  MarginNotes,
  MarkReadButton,
} from "@/components/Reader";

type NavLink = { href: string; label: string } | null;

/** The locator without the work-name prefix: "Meditations 4.3" -> "4.3". */
function locator(reference: string): string {
  return reference.split(" ").pop() ?? reference;
}

export default function ReadingView({
  work,
  label,
  part,
  passages,
  prev,
  next,
}: {
  work: Work;
  label: string | null;
  part: string;
  passages: Passage[];
  prev?: NavLink;
  next?: NavLink;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm opacity-60">{work.author}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {work.work}
          {label && <span className="opacity-60"> · {label}</span>}
        </h1>
        <p className="mt-1 text-sm opacity-60">
          translated by {work.translator}
        </p>
      </header>

      <AnnotationsProvider work={work.work}>
        <div className="flex flex-col gap-8">
          {passages.map((p) => (
            <article key={p.id}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-50">
                {locator(p.reference)}
              </p>
              <p className="whitespace-pre-line leading-relaxed">{p.text}</p>
              <MarginNotes passageId={p.id} />
            </article>
          ))}
        </div>
        <MarkReadButton
          work={work.work}
          part={part}
          passageIds={passages.map((p) => p.id)}
        />
      </AnnotationsProvider>

      {(prev || next) && (
        <nav className="mt-8 flex justify-between border-t border-black/10 pt-6 text-sm dark:border-white/15">
          {prev ? (
            <Link href={prev.href} className="opacity-70 hover:opacity-100">
              ← {prev.label}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={next.href} className="opacity-70 hover:opacity-100">
              {next.label} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
