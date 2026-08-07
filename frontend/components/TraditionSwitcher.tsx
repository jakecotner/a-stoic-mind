"use client";

// The app title as a dropdown: "A Stoic Mind" ▾ — switching tradition swaps
// the whole identity (brand, daily passage, library, people pages).
//
// Reading is open, so the switch always changes the VIEWING tradition (the
// cookie + a server-component refresh). For signed-in users it also tries
// to move their HOME tradition — the voice their reflections, mentor, and
// practice follow. Free users get one explicit home choice; after that the
// backend answers 402 and the menu turns into the Plus upsell while they
// keep browsing the other tradition freely.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { chooseTradition, TraditionPlusError } from "@/lib/api";
import {
  TRADITIONS,
  traditionMeta,
  writeTraditionCookie,
  type TraditionSlug,
} from "@/lib/tradition";
import { useViewingTradition } from "@/lib/useTradition";
import { useUser } from "@/lib/useUser";

function CaretDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 opacity-50">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function TraditionSwitcher() {
  const { user, refresh } = useUser();
  const router = useRouter();
  const viewing = useViewingTradition();
  const [open, setOpen] = useState(false);
  // Set when the free home-switch is used up: the menu shows the upsell
  // for this tradition instead of closing.
  const [plusFor, setPlusFor] = useState<TraditionSlug | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const select = async (slug: TraditionSlug) => {
    if (slug === viewing.slug) {
      setOpen(false);
      return;
    }
    // Browsing is open to everyone — swap the view first.
    writeTraditionCookie(slug);
    router.refresh();
    if (user && user.tradition !== slug) {
      try {
        await chooseTradition(slug);
        await refresh();
      } catch (e) {
        if (e instanceof TraditionPlusError) {
          setPlusFor(slug); // keep the menu open: browsing works, home didn't move
          return;
        }
        // Home didn't move (offline, etc.) — browsing still switched.
      }
    }
    setPlusFor(null);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setPlusFor(null);
        }}
        aria-expanded={open}
        aria-label="Switch tradition"
        className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <span className="truncate font-semibold">{viewing.brand}</span>
        <CaretDown />
      </button>
      {/* forced-color-adjust-none: under Windows contrast themes Chromium
          paints text backplates over forced backgrounds, so page text
          would show through this menu (see PlayButton's menuCls). */}
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-60 rounded-lg border border-black/10 bg-background py-1 text-foreground shadow-lg forced-color-adjust-none dark:border-white/20 dark:bg-neutral-800">
          {TRADITIONS.map((t) => (
            <button
              key={t.slug}
              onClick={() => void select(t.slug)}
              className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
            >
              <span>
                <span className="block text-sm font-medium">{t.brand}</span>
                <span className="block text-xs opacity-60">{t.name}</span>
              </span>
              {t.slug === viewing.slug && (
                <span className="text-xs opacity-60">✓</span>
              )}
            </button>
          ))}
          {plusFor && user && (
            <div className="mx-3 my-2 border-t border-black/10 pt-2 text-xs leading-relaxed opacity-80 dark:border-white/15">
              You&apos;re browsing {traditionMeta(plusFor).name} — read as much
              as you like. Your journal, mentor, and practice stay with{" "}
              {traditionMeta(user.tradition).name}; moving them again comes
              with{" "}
              <Link
                href="/account#billing"
                className="underline underline-offset-2"
                onClick={() => setOpen(false)}
              >
                Plus
              </Link>
              .
            </div>
          )}
        </div>
      )}
    </div>
  );
}
