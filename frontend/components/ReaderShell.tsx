"use client";

// The interactive reading surface. Clicking a passage opens a companion
// panel on the right (a bottom sheet on small screens) with the passage's
// breakdown — generated on the first view anywhere, cached for everyone
// after — plus the reader's own margin notes for that passage.
//
// A client component, but still server-rendered on first load, so the
// passage text stays in the HTML search engines index.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import BoldMarkdown from "@/components/BoldMarkdown";
import {
  AnnotationsProvider,
  MarginNotes,
  MarkReadButton,
} from "@/components/Reader";
import { fetchBreakdown, type Passage, type Work } from "@/lib/api";

type NavLink = { href: string; label: string } | null;

/** The locator without the work-name prefix: "Meditations 4.3" -> "4.3". */
function locator(reference: string): string {
  return reference.split(" ").pop() ?? reference;
}

function BreakdownPanel({
  passage,
  onClose,
}: {
  passage: Passage;
  onClose: () => void;
}) {
  // Session-local cache: reopening a passage shouldn't refetch.
  const cache = useRef(new Map<string, string | null>());
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "done"; text: string | null } | { kind: "error" }
  >({ kind: "loading" });

  useEffect(() => {
    const cached = cache.current.get(passage.id);
    if (cached !== undefined) {
      setState({ kind: "done", text: cached });
      return;
    }
    let stale = false;
    setState({ kind: "loading" });
    fetchBreakdown(passage.id)
      .then((b) => {
        cache.current.set(passage.id, b.breakdown);
        if (!stale) setState({ kind: "done", text: b.breakdown });
      })
      .catch(() => {
        if (!stale) setState({ kind: "error" });
      });
    return () => {
      stale = true;
    };
  }, [passage.id]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide opacity-60">
          {passage.reference}
        </h2>
        <button
          aria-label="Close panel"
          className="rounded px-2 text-sm opacity-50 hover:opacity-100"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide opacity-50">
          Breakdown
        </h3>
        {state.kind === "loading" && (
          <p className="text-sm italic opacity-60">
            Preparing the breakdown… the first view of a passage takes a few
            seconds while it&apos;s written.
          </p>
        )}
        {state.kind === "error" && (
          <p className="text-sm opacity-60">
            Couldn&apos;t load the breakdown — try again in a moment.
          </p>
        )}
        {state.kind === "done" &&
          (state.text ? (
            <BoldMarkdown text={state.text} />
          ) : (
            <p className="text-sm opacity-60">
              This passage&apos;s breakdown isn&apos;t available right now —
              the text stands on its own.
            </p>
          ))}
      </section>

      <section className="border-t border-black/10 pt-4 dark:border-white/15">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide opacity-50">
          Your notes
        </h3>
        <MarginNotes passageId={passage.id} />
        <p className="mt-3 text-xs opacity-50">
          Or{" "}
          <Link href="/" className="underline hover:opacity-80">
            write about it in your journal
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

export default function ReaderShell({
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
  const [selected, setSelected] = useState<Passage | null>(null);

  const close = useCallback(() => setSelected(null), []);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, close]);

  return (
    <AnnotationsProvider work={work.work}>
      <div
        className={
          selected
            ? "mx-auto w-full max-w-6xl px-4 py-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-10"
            : "mx-auto w-full max-w-3xl px-4 py-10"
        }
      >
        <div>
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

          <div className="flex flex-col gap-8">
            {passages.map((p) => (
              <article key={p.id}>
                {/* The text is the click target; notes below keep their own
                    controls. Clicking the selected passage again closes. */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Open companion panel for ${p.reference}`}
                  className={`-mx-2 cursor-pointer rounded-lg px-2 py-1 transition-colors ${
                    selected?.id === p.id
                      ? "bg-black/[.05] dark:bg-white/[.08]"
                      : "hover:bg-black/[.03] dark:hover:bg-white/[.04]"
                  }`}
                  onClick={() => setSelected(selected?.id === p.id ? null : p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(selected?.id === p.id ? null : p);
                    }
                  }}
                >
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-50">
                    {locator(p.reference)}
                  </p>
                  <p className="whitespace-pre-line leading-relaxed">
                    {p.text}
                  </p>
                </div>
                <MarginNotes passageId={p.id} />
              </article>
            ))}
          </div>
          <MarkReadButton
            work={work.work}
            part={part}
            passageIds={passages.map((p) => p.id)}
          />

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

        {selected && (
          <aside
            className="fixed inset-x-0 bottom-0 z-10 max-h-[70vh] overflow-y-auto border-t border-black/10 bg-background p-4 shadow-lg lg:sticky lg:top-10 lg:max-h-none lg:overflow-visible lg:border-l lg:border-t-0 lg:bg-transparent lg:p-0 lg:pl-8 lg:shadow-none dark:border-white/15"
            aria-label="Passage companion panel"
          >
            <BreakdownPanel passage={selected} onClose={close} />
          </aside>
        )}
      </div>
    </AnnotationsProvider>
  );
}
