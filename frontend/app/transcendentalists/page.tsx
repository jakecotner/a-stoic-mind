import type { Metadata } from "next";
import Link from "next/link";
import StoicPortrait from "@/components/StoicPortrait";
import { CIRCLE_INTRO, TRANSCENDENTALISTS } from "@/lib/transcendentalists";

export const metadata: Metadata = {
  title: "The Transcendentalists — A Transcendental Mind",
  description:
    "Meet the Transcendentalists: Ralph Waldo Emerson, Henry David Thoreau, and Margaret Fuller — their lives, their teachings, and their works in the Library.",
};

export default function TranscendentalistsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        {CIRCLE_INTRO.title}
      </h1>
      <p className="mb-1 text-xs opacity-60">{CIRCLE_INTRO.span}</p>
      <p className="mb-10 max-w-2xl text-sm opacity-70">{CIRCLE_INTRO.blurb}</p>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {TRANSCENDENTALISTS.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/transcendentalists/${t.slug}`}
              className="group block rounded-lg border border-black/10 p-3 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              <div className="relative mb-3 aspect-[4/5] overflow-hidden rounded-md bg-black/5 dark:bg-white/10">
                <StoicPortrait
                  subject={t}
                  sizes="(max-width: 640px) 50vw, 260px"
                />
              </div>
              <p className="font-medium leading-tight">{t.name}</p>
              <p className="mt-0.5 text-xs opacity-60">{t.dates}</p>
              <p className="mt-1.5 text-xs leading-snug opacity-70">
                {t.epithet}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
