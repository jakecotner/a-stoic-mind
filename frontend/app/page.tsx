import type { Metadata } from "next";
import Link from "next/link";

// The public landing page: a server component, statically rendered, fully
// indexable. This is the SEO surface — put real copy, structured headings,
// and any public content routes (docs, pricing, programmatic pages) on this
// side of the auth wall.
export const metadata: Metadata = {
  description:
    "A Stoic Mind — describe the product in one indexable sentence. This page is statically rendered and is what search engines see.",
};

export default function LandingPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-8 px-4 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        A Stoic Mind
      </h1>
      <p className="max-w-xl text-lg opacity-75">
        One paragraph of real product copy. Search engines index this page, so
        say what the product does and for whom — no filler.
      </p>
      <div className="flex gap-4">
        <Link
          href="/register"
          className="rounded-lg bg-foreground px-5 py-2.5 font-medium text-background hover:opacity-85"
        >
          Get started free
        </Link>
        <Link
          href="/chat"
          className="rounded-lg border border-black/15 px-5 py-2.5 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Try it without an account
        </Link>
      </div>
      <section className="mt-12 grid w-full gap-6 text-left sm:grid-cols-3">
        {[
          ["Feature one", "A sentence on the first thing the product does."],
          ["Feature two", "A sentence on the second thing the product does."],
          ["Feature three", "A sentence on the third thing the product does."],
        ].map(([title, body]) => (
          <div
            key={title}
            className="rounded-xl border border-black/10 p-5 dark:border-white/15"
          >
            <h2 className="mb-1 font-medium">{title}</h2>
            <p className="text-sm opacity-70">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
