import { z } from "zod";
import { toAsciiDigits } from "@/lib/phone";
import type { ListingType } from "@/types/database";
import { optionalInt } from "./common";
import { LISTING_TYPES, TENANT_TYPES } from "./listing";
import { AMENITIES } from "./property";

// Search filters live in the URL, so a search can be shared, bookmarked and
// opened by Google. The same parser runs on the server (search page) and in
// the browser (filter forms and the map). Values that do not make sense are
// dropped silently instead of showing an error, because people edit URLs.

export const SEARCH_SORTS = ["newest", "rent_asc", "rent_desc"] as const;
/** "any" means line gas or a cylinder, anything but no gas. */
export const GAS_FILTERS = ["titas_line", "lpg", "any"] as const;
/** "4" means 4 or more. */
export const BEDROOM_FILTERS = [1, 2, 3, 4] as const;
export const SEARCH_VIEWS = ["list", "map"] as const;

export const PAGE_SIZE = 20;
/** Markers loaded at once on the map; the database caps calls at 300 too. */
export const MAP_LIMIT = 300;
/** Same bounds as the monthly_rent check in the database. */
export const RENT_MAX = 10_000_000;
const MAX_PAGE = 500;

export type TenantType = (typeof TENANT_TYPES)[number];
export type Amenity = (typeof AMENITIES)[number];
export type SearchSort = (typeof SEARCH_SORTS)[number];
export type GasFilter = (typeof GAS_FILTERS)[number];
export type SearchView = (typeof SEARCH_VIEWS)[number];

/** Where to search: one area, or every area of a thana. */
export type PlaceFilter = { kind: "area"; id: number } | { kind: "thana"; id: number };

export type SearchFilters = {
  q: string | null;
  place: PlaceFilter | null;
  types: ListingType[];
  tenants: TenantType[];
  rentMin: number | null;
  rentMax: number | null;
  bedsMin: number | null;
  amenities: Amenity[];
  gas: GasFilter | null;
  availableBy: string | null;
  sort: SearchSort;
  page: number;
  view: SearchView;
};

export const EMPTY_FILTERS: SearchFilters = {
  q: null,
  place: null,
  types: [],
  tenants: [],
  rentMin: null,
  rentMax: null,
  bedsMin: null,
  amenities: [],
  gas: null,
  availableBy: null,
  sort: "newest",
  page: 1,
  view: "list",
};

type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function all(raw: RawParams, key: string): string[] {
  if (raw instanceof URLSearchParams) return raw.getAll(key);
  const value = raw[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function first(raw: RawParams, key: string) {
  return all(raw, key)[0] ?? null;
}

/** Repeated keys (type=flat&type=room) and comma lists (type=flat,room) both work. */
function pickList<T extends string>(raw: RawParams, key: string, allowed: readonly T[]): T[] {
  const values = all(raw, key).flatMap((v) => v.split(","));
  return allowed.filter((a) => values.includes(a));
}

function pickOne<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const rentSchema = optionalInt(0, RENT_MAX).catch(null);
const pageSchema = optionalInt(1, MAX_PAGE).catch(null);
const dateSchema = z.iso.date().nullable().catch(null);

/** "Mirpur  10 " becomes "Mirpur 10". At most 80 characters. */
export function cleanKeyword(value: string | null | undefined) {
  const text = (value ?? "").replace(/\s+/g, " ").trim().slice(0, 80).trim();
  return text === "" ? null : text;
}

/** area=10002 is one area, area=t1002 is every area of thana 1002. */
export function parsePlace(value: string | null): PlaceFilter | null {
  if (!value) return null;
  const text = toAsciiDigits(value.trim());
  const thana = /^t(\d{1,9})$/.exec(text);
  if (thana) return { kind: "thana", id: Number(thana[1]) };
  if (/^\d{1,9}$/.test(text)) return { kind: "area", id: Number(text) };
  return null;
}

export function placeParam(place: PlaceFilter | null) {
  if (!place) return null;
  return place.kind === "thana" ? `t${place.id}` : String(place.id);
}

export function parseSearchParams(raw: RawParams): SearchFilters {
  let rentMin = rentSchema.parse(first(raw, "min"));
  let rentMax = rentSchema.parse(first(raw, "max"));
  if (rentMin === 0) rentMin = null;
  if (rentMin !== null && rentMax !== null && rentMin > rentMax) [rentMin, rentMax] = [rentMax, rentMin];

  const beds = Number(toAsciiDigits(first(raw, "beds") ?? ""));

  return {
    q: cleanKeyword(first(raw, "q")),
    place: parsePlace(first(raw, "area")),
    types: pickList(raw, "type", LISTING_TYPES),
    tenants: pickList(raw, "tenant", TENANT_TYPES),
    rentMin,
    rentMax,
    bedsMin: (BEDROOM_FILTERS as readonly number[]).includes(beds) ? beds : null,
    amenities: pickList(raw, "amenity", AMENITIES),
    gas: pickOne(first(raw, "gas"), GAS_FILTERS),
    availableBy: dateSchema.parse(first(raw, "by")),
    sort: pickOne(first(raw, "sort"), SEARCH_SORTS) ?? "newest",
    page: pageSchema.parse(first(raw, "page")) ?? 1,
    view: pickOne(first(raw, "view"), SEARCH_VIEWS) ?? "list",
  };
}

/**
 * The query string for a set of filters, without defaults and in a fixed
 * order, so the same search always has the same URL.
 */
export function toQueryString(filters: SearchFilters) {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  const place = placeParam(filters.place);
  if (place) p.set("area", place);
  filters.types.forEach((v) => p.append("type", v));
  filters.tenants.forEach((v) => p.append("tenant", v));
  if (filters.rentMin !== null) p.set("min", String(filters.rentMin));
  if (filters.rentMax !== null) p.set("max", String(filters.rentMax));
  if (filters.bedsMin !== null) p.set("beds", String(filters.bedsMin));
  filters.amenities.forEach((v) => p.append("amenity", v));
  if (filters.gas) p.set("gas", filters.gas);
  if (filters.availableBy) p.set("by", filters.availableBy);
  if (filters.sort !== "newest") p.set("sort", filters.sort);
  if (filters.view !== "list") p.set("view", filters.view);
  if (filters.page > 1) p.set("page", String(filters.page));
  return p.toString();
}

/** The search page URL (without the language prefix) for these filters. */
export function searchHref(filters: SearchFilters, changes: Partial<SearchFilters> = {}) {
  const qs = toQueryString({ ...filters, ...changes });
  return qs ? `/ads?${qs}` : "/ads";
}

/** Filters inside the filter panel (not keyword, place, sort, view or page). */
export function countPanelFilters(f: SearchFilters) {
  return (
    (f.types.length > 0 ? 1 : 0) +
    (f.tenants.length > 0 ? 1 : 0) +
    (f.rentMin !== null || f.rentMax !== null ? 1 : 0) +
    (f.bedsMin !== null ? 1 : 0) +
    (f.amenities.length > 0 ? 1 : 0) +
    (f.gas !== null ? 1 : 0) +
    (f.availableBy !== null ? 1 : 0)
  );
}

export function hasAnyFilter(f: SearchFilters) {
  return f.q !== null || f.place !== null || countPanelFilters(f) > 0;
}

/**
 * Same as public.search_compact() in the database: lower case, Bangla
 * digits as ASCII, no spaces or punctuation.
 */
export function compactText(value: string) {
  return toAsciiDigits(value.toLowerCase()).replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** Arguments for public.search_listings(). areaIds comes from resolvePlace(). */
export function toSearchArgs(
  f: SearchFilters,
  areaIds: number[] | null,
  options: { limit: number; offset: number; bounds?: [number, number, number, number] },
) {
  return {
    p_q: f.q,
    p_area_ids: areaIds,
    p_types: f.types.length ? f.types : null,
    p_tenant_types: f.tenants.length ? f.tenants : null,
    p_rent_min: f.rentMin,
    p_rent_max: f.rentMax,
    p_bedrooms_min: f.bedsMin,
    p_amenities: f.amenities.length ? f.amenities : null,
    p_gas: f.gas,
    p_available_by: f.availableBy,
    p_bounds: options.bounds ?? null,
    p_sort: f.sort,
    p_limit: options.limit,
    p_offset: options.offset,
  };
}

export type SearchArgs = ReturnType<typeof toSearchArgs>;
