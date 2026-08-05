// The traditions, as the frontend knows them (client-safe, no fetches).
// Mirrors the backend registry (backend/app/services/tradition.py) — slugs
// are stable keys, append-only. Availability is runtime data and comes from
// GET /api/traditions; everything here is display content.
//
// The VIEWING tradition — which tradition's daily passage, library, and
// people pages the visitor is looking at — lives in a plain cookie so the
// server-rendered pages (landing, library) can read it. It is distinct from
// a signed-in user's HOME tradition (users.tradition, set via
// PUT /api/traditions/mine): reading is open to everyone, while the
// practice surfaces (journal reflections, mentor, practice) follow home.

export type TraditionSlug = "stoicism" | "transcendentalism";

export const TRADITION_COOKIE = "tradition";
export const DEFAULT_TRADITION: TraditionSlug = "stoicism";

/** Fired (on window) when the viewing tradition changes, so client
    components (the sidebar) update without a remount. */
export const TRADITION_CHANGED_EVENT = "tradition-changed";

export type TraditionMeta = {
  slug: TraditionSlug;
  name: string;
  /** The app identity this tradition wears — the title dropdown swaps it. */
  brand: string;
  /** The people pages: route and how the nav item reads. */
  peopleHref: string;
  peopleLabel: string;
  /** One-line hero blurb on the signed-out landing page. */
  landingBlurb: string;
  /** The library page's intro line. */
  libraryBlurb: string;
};

export const TRADITIONS: TraditionMeta[] = [
  {
    slug: "stoicism",
    name: "Stoicism",
    brand: "A Stoic Mind",
    peopleHref: "/stoics",
    peopleLabel: "The Stoics",
    landingBlurb:
      "A hand-picked passage from the Stoic classics every day, with a grounded reflection, and a private journal alongside it.",
    libraryBlurb:
      "The Stoic classics, free to read. Open a work to read it — signed in, you can take margin notes and keep your reading in your practice calendar.",
  },
  {
    slug: "transcendentalism",
    name: "Transcendentalism",
    brand: "A Transcendental Mind",
    peopleHref: "/transcendentalists",
    peopleLabel: "The Transcendentalists",
    landingBlurb:
      "A hand-picked passage from Emerson, Thoreau, and the Transcendentalists every day, with a grounded reflection, and a private journal alongside it.",
    libraryBlurb:
      "The Transcendentalist classics, free to read. Open a work to read it — signed in, you can take margin notes and keep your reading in your practice calendar.",
  },
];

export function isTraditionSlug(v: unknown): v is TraditionSlug {
  return TRADITIONS.some((t) => t.slug === v);
}

/** Meta for a slug, falling back to the default — a stale cookie value
    should never break a page. */
export function traditionMeta(slug: string | undefined): TraditionMeta {
  return (
    TRADITIONS.find((t) => t.slug === slug) ??
    TRADITIONS.find((t) => t.slug === DEFAULT_TRADITION)!
  );
}

// --- Client-side cookie access (server pages use lib/tradition-server.ts)

/** The viewing tradition from document.cookie (browser only). */
export function readTraditionCookie(): TraditionSlug {
  if (typeof document === "undefined") return DEFAULT_TRADITION;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${TRADITION_COOKIE}=([^;]*)`),
  );
  const value = match?.[1];
  return isTraditionSlug(value) ? value : DEFAULT_TRADITION;
}

/** Set the viewing tradition (browser only) and notify listeners. The
    caller still needs router.refresh() so server components re-render. */
export function writeTraditionCookie(slug: TraditionSlug): void {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${TRADITION_COOKIE}=${slug}; path=/; max-age=${maxAge}; samesite=lax`;
  window.dispatchEvent(new Event(TRADITION_CHANGED_EVENT));
}
