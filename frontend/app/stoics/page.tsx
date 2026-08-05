import type { Metadata } from "next";
import Link from "next/link";
import StoicPortrait from "@/components/StoicPortrait";
import { ERAS, STOICS } from "@/lib/stoics";

export const metadata: Metadata = {
  title: "The Stoics — A Stoic Mind",
  description:
    "Meet the Stoics: Zeno, Cleanthes, Chrysippus, Panaetius, Posidonius, Cato, Seneca, Musonius Rufus, Epictetus, and Marcus Aurelius — their lives, their teachings, and their works in the Library.",
};

export default function StoicsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">The Stoics</h1>
      <p className="mb-10 max-w-2xl text-sm opacity-70">
        A shipwrecked merchant, a boxer, an emperor, a slave. The people who
        built Stoicism led lives as instructive as their books — meet each of
        them, and follow the ones whose works survive into the Library.
      </p>
      {ERAS.map((era) => {
        const members = STOICS.filter((s) => s.era === era.key);
        return (
          <section key={era.key} className="mb-12">
            <div className="mb-1 flex items-baseline gap-3">
              <h2 className="text-lg font-medium">{era.title}</h2>
              <span className="text-xs opacity-60">{era.span}</span>
            </div>
            <p className="mb-2 max-w-2xl text-sm opacity-70">{era.blurb}</p>
            <details className="group mb-4 max-w-2xl">
              <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-xs font-medium opacity-60 transition-opacity hover:opacity-100 [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden
                  className="inline-block transition-transform group-open:rotate-90"
                >
                  ▸
                </span>
                Contemporary history
              </summary>
              <div className="mt-2 space-y-2 border-l-2 border-black/10 pl-3 text-sm opacity-70 dark:border-white/15">
                {era.history.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </details>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {members.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/stoics/${s.slug}`}
                    className="group block rounded-lg border border-black/10 p-3 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  >
                    <div className="relative mb-3 aspect-[4/5] overflow-hidden rounded-md bg-black/5 dark:bg-white/10">
                      <StoicPortrait
                        subject={s}
                        sizes="(max-width: 640px) 50vw, 260px"
                      />
                    </div>
                    <p className="font-medium leading-tight">{s.name}</p>
                    <p className="mt-0.5 text-xs opacity-60">{s.dates}</p>
                    <p className="mt-1.5 text-xs leading-snug opacity-70">
                      {s.epithet}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
