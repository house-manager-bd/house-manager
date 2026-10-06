import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import type { ListingPhoto } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import type { BuildingRow, ListingRow, NearbyKind, UnitRow } from "@/types/database";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdBuilding = Omit<BuildingRow, "name"> & {
  /** Only for logged-in members (the name is often on the gate). */
  name: string | null;
};

export type AdPage = {
  listing: ListingRow;
  unit: UnitRow;
  building: AdBuilding;
  photos: ListingPhoto[];
  nearby: { kind: NearbyKind; name: string; walk_minutes: number | null }[];
  poster: { id: string; full_name: string; avatar_url: string | null; created_at: string } | null;
  /** Exact address and pin: logged-in members while the ad is live, and managers. */
  address: { road_address: string; house_no: string | null; exact_lat: number; exact_lng: number } | null;
  /** Numbers without a reveal: only the poster and the building's managers. */
  ownContact: { contact_phone: string | null; whatsapp: string | null } | null;
  viewer: { id: string; isPoster: boolean } | null;
};

/**
 * Everything the ad page shows. Row Level Security decides what each person
 * may see: visitors get live ads without the building name, address or
 * numbers; members also get the address; the poster and the building's
 * managers see their own ads in any status.
 * Cached per request, so the page and its metadata share one load.
 */
export const getAdPage = cache(async (listingId: string): Promise<AdPage | null> => {
  if (!UUID.test(listingId)) return null;
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);

  const { data: listing } = await supabase.from("listings").select("*").eq("id", listingId).maybeSingle();
  if (!listing) return null;

  const [{ data: unit }, { data: photos }, { data: poster }, { data: ownContact }] = await Promise.all([
    supabase.from("units").select("*").eq("id", listing.unit_id).maybeSingle(),
    supabase
      .from("listing_photos")
      .select("id, storage_path, width, height")
      .eq("listing_id", listingId)
      .order("sort_order"),
    supabase.from("profiles").select("id, full_name, avatar_url, created_at").eq("id", listing.posted_by).maybeSingle(),
    user
      ? supabase.from("listing_private").select("contact_phone, whatsapp").eq("listing_id", listingId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!unit) return null;

  // Visitors may not read the name column at all, so they ask for the others.
  const buildingQuery = user
    ? supabase.from("buildings").select("*").eq("id", unit.building_id).maybeSingle()
    : supabase
        .from("buildings")
        .select(
          "id, created_by, owner_id, area_id, landmark, approx_lat, approx_lng, total_floors, gas, amenities, house_rules, created_at, updated_at",
        )
        .eq("id", unit.building_id)
        .maybeSingle();

  const [{ data: building }, { data: nearby }, { data: priv }] = await Promise.all([
    buildingQuery,
    supabase.from("nearby_places").select("kind, name, walk_minutes").eq("building_id", unit.building_id),
    user
      ? supabase
          .from("building_private")
          .select("road_address, house_no, exact_lat, exact_lng")
          .eq("building_id", unit.building_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!building) return null;

  return {
    listing,
    unit,
    building: {
      ...building,
      name: "name" in building ? (building.name as string) : null,
      approx_lat: Number(building.approx_lat),
      approx_lng: Number(building.approx_lng),
    },
    photos: photos ?? [],
    nearby: nearby ?? [],
    poster,
    address: priv ? { ...priv, exact_lat: Number(priv.exact_lat), exact_lng: Number(priv.exact_lng) } : null,
    ownContact: ownContact ?? null,
    viewer: user ? { id: user.id, isPoster: user.id === listing.posted_by } : null,
  };
});
