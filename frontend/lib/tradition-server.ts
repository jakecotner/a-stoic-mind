// Server-side read of the viewing-tradition cookie. Request-time only —
// every caller is already force-dynamic (landing, library), so this adds
// no new dynamic rendering.
import { cookies } from "next/headers";

import {
  DEFAULT_TRADITION,
  isTraditionSlug,
  TRADITION_COOKIE,
  type TraditionSlug,
} from "./tradition";

export async function getViewingTradition(): Promise<TraditionSlug> {
  const store = await cookies();
  const value = store.get(TRADITION_COOKIE)?.value;
  return isTraditionSlug(value) ? value : DEFAULT_TRADITION;
}
