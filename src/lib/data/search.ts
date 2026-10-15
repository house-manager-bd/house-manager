import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toSearchResult, type SearchResult } from "@/lib/search";
import { EMPTY_FILTERS, toSearchArgs, type SearchFilters } from "@/lib/validation/search";

export type SearchPage = {
  results: SearchResult[];
  /** Matching ads in total, not only on this page. */
  total: number;
  /** False when the database call failed (the page then says so). */
  ok: boolean;
};

/**
 * Runs public.search_listings(). It returns only live ads and only what a
 * visitor may see, whoever is signed in.
 */
export async function searchListings(
  filters: SearchFilters,
  areaIds: number[] | null,
  options: { limit: number; offset: number },
): Promise<SearchPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_listings", toSearchArgs(filters, areaIds, options));
  if (error) {
    console.error("search_listings failed", error.message);
    return { results: [], total: 0, ok: false };
  }
  const rows = data ?? [];
  return { results: rows.map(toSearchResult), total: Number(rows[0]?.total_count ?? 0), ok: true };
}

/** The newest live ads, for the home page. */
export async function latestListings(limit: number) {
  return searchListings(EMPTY_FILTERS, null, { limit, offset: 0 });
}
