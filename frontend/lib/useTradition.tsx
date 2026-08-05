"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_TRADITION,
  readTraditionCookie,
  TRADITION_CHANGED_EVENT,
  traditionMeta,
  type TraditionMeta,
  type TraditionSlug,
} from "./tradition";

/** The viewing tradition for client components. Starts at the default and
    syncs from the cookie after mount (same first-paint pattern as the
    sidebar's collapsed state — avoids a hydration mismatch), then follows
    TRADITION_CHANGED_EVENT for same-tab switches. */
export function useViewingTradition(): TraditionMeta {
  const [slug, setSlug] = useState<TraditionSlug>(DEFAULT_TRADITION);
  useEffect(() => {
    const sync = () => setSlug(readTraditionCookie());
    sync();
    window.addEventListener(TRADITION_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TRADITION_CHANGED_EVENT, sync);
  }, []);
  return traditionMeta(slug);
}
