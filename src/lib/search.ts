// Search helpers shared by the server pages and the browser (filter forms,
// map). Nothing here reads the database.
import type { LocationTree } from "@/lib/data/locations";
import type { SearchListingRow } from "@/types/database";
import type { PlaceFilter } from "@/lib/validation/search";

/** A search result as the cards and the map use it. */
export type SearchResult = Omit<SearchListingRow, "total_count">;

export function toSearchResult(row: SearchListingRow): SearchResult {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { total_count, ...rest } = row;
  return {
    ...rest,
    // Postgres numeric values can arrive as strings.
    approx_lat: Number(row.approx_lat),
    approx_lng: Number(row.approx_lng),
    monthly_rent: row.monthly_rent === null ? null : Number(row.monthly_rent),
  };
}

export type PlaceOption = { value: string; label: string };
export type PlaceGroup = { label: string; thana: PlaceOption; areas: PlaceOption[] };

const pick = (row: { name_en: string; name_bn: string }, locale: string) =>
  locale === "bn" ? row.name_bn : row.name_en;

/**
 * Area choices grouped by thana, for the area select. Each group starts
 * with a "whole thana" choice (value t<thana id>).
 */
export function placeGroups(tree: LocationTree, locale: string, thanaAll: (thana: string) => string): PlaceGroup[] {
  const collator = new Intl.Collator(locale === "bn" ? "bn" : "en", { numeric: true });
  return tree.thanas
    .map((thana) => {
      const areas = tree.areas
        .filter((a) => a.thana_id === thana.id)
        .map((a) => ({ value: String(a.id), label: pick(a, locale) }))
        .sort((x, y) => collator.compare(x.label, y.label));
      return {
        label: pick(thana, locale),
        thana: { value: `t${thana.id}`, label: thanaAll(pick(thana, locale)) },
        areas,
      };
    })
    .filter((g) => g.areas.length > 0)
    .sort((x, y) => collator.compare(x.label, y.label));
}

/** Area ids to search, or null for everywhere. Unknown ids count as everywhere. */
export function placeAreaIds(tree: LocationTree, place: PlaceFilter | null): number[] | null {
  if (!place) return null;
  if (place.kind === "area") return tree.areas.some((a) => a.id === place.id) ? [place.id] : null;
  const ids = tree.areas.filter((a) => a.thana_id === place.id).map((a) => a.id);
  return ids.length ? ids : null;
}

/** "Mirpur 10" or "Pallabi thana" style name of the place, or null. */
export function placeName(tree: LocationTree, place: PlaceFilter | null, locale: string): string | null {
  if (!place) return null;
  if (place.kind === "area") {
    const area = tree.areas.find((a) => a.id === place.id);
    return area ? pick(area, locale) : null;
  }
  const thana = tree.thanas.find((t) => t.id === place.id);
  return thana ? pick(thana, locale) : null;
}

/** Area id to "Mirpur 10, Mirpur Model" labels, for the cards. */
export function areaLabels(tree: LocationTree, locale: string): Record<number, string> {
  const labels: Record<number, string> = {};
  for (const area of tree.areas) {
    const thana = tree.thanas.find((t) => t.id === area.thana_id);
    labels[area.id] = thana ? `${pick(area, locale)}, ${pick(thana, locale)}` : pick(area, locale);
  }
  return labels;
}

/** Centre and zoom that show the chosen place (or all of Mirpur). */
export function placeView(tree: LocationTree, areaIds: number[] | null) {
  const areas = areaIds ? tree.areas.filter((a) => areaIds.includes(a.id)) : tree.areas;
  if (areas.length === 0) return { south: 23.78, west: 90.34, north: 23.84, east: 90.40 };
  const lats = areas.map((a) => a.center_lat);
  const lngs = areas.map((a) => a.center_lng);
  const pad = 0.006; // about 650 m
  return {
    south: Math.min(...lats) - pad,
    west: Math.min(...lngs) - pad,
    north: Math.max(...lats) + pad,
    east: Math.max(...lngs) + pad,
  };
}

export type PinGroup = { key: string; lat: number; lng: number; ads: SearchResult[] };

/**
 * Ads in the same building share one public pin, so they become one marker.
 * Cheapest ad first inside each marker.
 */
export function groupByPin(results: SearchResult[]): PinGroup[] {
  const groups = new Map<string, PinGroup>();
  for (const ad of results) {
    const key = `${ad.approx_lat.toFixed(5)},${ad.approx_lng.toFixed(5)}`;
    const group = groups.get(key) ?? { key, lat: ad.approx_lat, lng: ad.approx_lng, ads: [] };
    group.ads.push(ad);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.ads.sort((a, b) => (a.monthly_rent ?? Infinity) - (b.monthly_rent ?? Infinity));
  }
  return [...groups.values()];
}
