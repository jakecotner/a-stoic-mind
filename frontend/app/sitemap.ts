import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Only public, indexable routes belong here — never the authed app surface.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/register`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/login`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
