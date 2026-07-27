// Shared helpers for the library pages (client-safe, no fetches).
import type { Work } from "./api";

/** URL slug for a work name: "Moral Letters to Lucilius" ->
    "moral-letters-to-lucilius". */
export function workSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function findWorkBySlug(works: Work[], slug: string): Work | undefined {
  return works.find((w) => workSlug(w.work) === slug);
}
