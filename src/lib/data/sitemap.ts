import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { EMPTY_FILTERS, MAP_LIMIT, toSearchArgs } from "@/lib/validation/search";

export type SitemapAd = { id: string; publishedAt: string | null; areaId: number; type: string; cover: string | null };

export type SitemapData = {
  ads: SitemapAd[];
  /** Areas and thanas with at least one live ad (their search pages are indexable). */
  areaIds: number[];
  thanaIds: number[];
  types: string[];
};

/** At most this many ads (about 12,000 addresses with both languages; a sitemap allows 50,000). */
const MAX_ADS = 6000;

/**
 * Every live, not paused ad, through the same search_listings() that visitors
 * use, so the sitemap never lists anything a visitor cannot open. Returns null
 * when the database cannot be reached; the sitemap then lists only the fixed
 * pages.
 */
export async function getSitemapData(): Promise<SitemapData | null> {
  const supabase = createPublicClient();
  const ads: SitemapAd[] = [];
  for (let offset = 0; offset < MAX_ADS; offset += MAP_LIMIT) {
    const { data, error } = await supabase.rpc(
      "search_listings",
      toSearchArgs(EMPTY_FILTERS, null, { limit: MAP_LIMIT, offset }),
    );
    if (error) {
      console.error("F12: sitemap could not read ads:", error.message);
      return null;
    }
    const rows = data ?? [];
    for (const r of rows) {
      ads.push({ id: r.id, publishedAt: r.published_at, areaId: r.area_id, type: r.listing_type, cover: r.cover_path });
    }
    if (rows.length < MAP_LIMIT || ads.length >= Number(rows[0]?.total_count ?? 0)) break;
  }

  const areaIds = [...new Set(ads.map((a) => a.areaId))].sort((a, b) => a - b);
  let thanaIds: number[] = [];
  if (areaIds.length > 0) {
    const { data, error } = await supabase.from("areas").select("id, thana_id").in("id", areaIds);
    if (!error) thanaIds = [...new Set((data ?? []).map((a) => a.thana_id))].sort((a, b) => a - b);
  }
  const types = [...new Set(ads.map((a) => a.type))].sort();
  return { ads, areaIds, thanaIds, types };
}
