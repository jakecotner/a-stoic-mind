import type { MetadataRoute } from "next";
import { getWorks } from "@/lib/corpus-server";
import { workSlug } from "@/lib/library";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Only public, indexable routes belong here — never the authed app surface.
// The library's work pages are the SEO backbone: public-domain texts, one
// stable URL per work.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let workUrls: MetadataRoute.Sitemap = [];
  try {
    workUrls = (await getWorks()).map((w) => ({
      url: `${BASE}/library/${workSlug(w.work)}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }));
  } catch {
    // Backend unreachable at build time — ship the static routes.
  }
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/library`, changeFrequency: "monthly", priority: 0.9 },
    ...workUrls,
    { url: `${BASE}/register`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/login`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
