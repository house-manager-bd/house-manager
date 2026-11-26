import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getSitemapData } from "@/lib/data/sitemap";
import { photoUrl } from "@/lib/photos";
import { deploymentUrl } from "@/lib/site";
import type { ListingType } from "@/types/database";
import { EMPTY_FILTERS, searchHref } from "@/lib/validation/search";

// F12 (FR33): the pages search engines may index, in both languages, with
// hreflang links between them. Built at most once an hour.
export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

/** Public pages that do not depend on data. */
const FIXED: { path: string; changeFrequency: Entry["changeFrequency"]; priority: number }[] = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/ads", changeFrequency: "hourly", priority: 0.9 },
  { path: "/rights", changeFrequency: "monthly", priority: 0.5 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = deploymentUrl();
  const languages = (path: string) =>
    Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}${path}`]));
  // One entry per language, each listing both languages as alternates.
  const both = (path: string, extra: Omit<Entry, "url" | "alternates">): Entry[] =>
    routing.locales.map((l) => ({ url: `${base}/${l}${path}`, alternates: { languages: languages(path) }, ...extra }));

  const entries: Entry[] = FIXED.flatMap((p) =>
    both(p.path, { changeFrequency: p.changeFrequency, priority: p.priority }),
  );

  const data = await getSitemapData();
  if (!data) return entries;

  // Search pages for one area, one thana or one ad type (the indexable ones, F4).
  const searchPages = [
    ...data.thanaIds.map((id) => searchHref(EMPTY_FILTERS, { place: { kind: "thana", id } })),
    ...data.areaIds.map((id) => searchHref(EMPTY_FILTERS, { place: { kind: "area", id } })),
    ...data.types.map((type) => searchHref(EMPTY_FILTERS, { types: [type as ListingType] })),
  ];
  for (const path of searchPages) entries.push(...both(path, { changeFrequency: "daily", priority: 0.7 }));

  for (const ad of data.ads) {
    entries.push(
      ...both(`/ads/${ad.id}`, {
        lastModified: ad.publishedAt ?? undefined,
        changeFrequency: "weekly",
        priority: 0.6,
        images: ad.cover ? [photoUrl(ad.cover)] : undefined,
      }),
    );
  }
  return entries;
}
