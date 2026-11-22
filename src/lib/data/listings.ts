import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ListingPhoto } from "@/lib/photos";
import type { ListingRow, UnitRow } from "@/types/database";
import { getMyBuilding, type BuildingDetail } from "./properties";

export type MyListing = ListingRow & {
  unit: Pick<UnitRow, "id" | "label" | "unit_kind" | "status"> | null;
  buildingName: string;
  areaId: number | null;
  coverPath: string | null;
  photoCount: number;
  /** F10: another ad (a draft too) holds the unit, so this one cannot be renewed or re-listed. */
  unitHeldByOther: boolean;
  /** F10: a tenancy made on the site is active on the unit (it ends in House Manage). */
  unitHasTenancy: boolean;
};

const OPEN: ListingRow["status"][] = ["draft", "pending_review", "active", "hidden"];

/** The user's own ads, newest first. */
export async function getMyListings(userId: string): Promise<MyListing[]> {
  const supabase = await createClient();
  const { data: listings } = await supabase
    .from("listings")
    .select("*")
    .eq("posted_by", userId)
    .order("updated_at", { ascending: false });
  if (!listings?.length) return [];

  const unitIds = [...new Set(listings.map((l) => l.unit_id))];
  const { data: units } = await supabase
    .from("units")
    .select("id, label, unit_kind, status, building_id")
    .in("id", unitIds);
  const buildingIds = [...new Set((units ?? []).map((u) => u.building_id))];
  const [{ data: buildings }, { data: photos }, { data: unitAds }, { data: tenancies }] = await Promise.all([
    buildingIds.length
      ? supabase.from("buildings").select("id, name, area_id").in("id", buildingIds)
      : Promise.resolve({ data: [] as { id: string; name: string; area_id: number }[] }),
    supabase
      .from("listing_photos")
      .select("listing_id, storage_path, is_cover")
      .in(
        "listing_id",
        listings.map((l) => l.id),
      ),
    // F10: other ads on the same units (an ad by a caretaker or co-owner too).
    supabase.from("listings").select("id, unit_id, status").in("unit_id", unitIds).in("status", OPEN),
    supabase.from("tenancies").select("unit_id").in("unit_id", unitIds).eq("status", "active"),
  ]);

  return listings.map((l) => {
    const unit = units?.find((u) => u.id === l.unit_id) ?? null;
    const building = buildings?.find((b) => b.id === unit?.building_id);
    return {
      ...l,
      unit: unit ? { id: unit.id, label: unit.label, unit_kind: unit.unit_kind, status: unit.status } : null,
      buildingName: building?.name ?? "",
      areaId: building?.area_id ?? null,
      coverPath: photos?.find((p) => p.listing_id === l.id && p.is_cover)?.storage_path ?? null,
      photoCount: photos?.filter((p) => p.listing_id === l.id).length ?? 0,
      unitHeldByOther: (unitAds ?? []).some((a) => a.unit_id === l.unit_id && a.id !== l.id),
      unitHasTenancy: (tenancies ?? []).some((t) => t.unit_id === l.unit_id),
    };
  });
}

export type DraftForWizard = {
  listing: ListingRow;
  photos: ListingPhoto[];
  contact: { contact_phone: string | null; whatsapp: string | null };
  unit: UnitRow;
  building: BuildingDetail;
};

/** A draft the user is editing, with everything the wizard shows. */
export async function getDraftForWizard(
  userId: string,
  listingId: string,
): Promise<DraftForWizard | null> {
  const supabase = await createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .eq("posted_by", userId)
    .maybeSingle();
  if (!listing) return null;

  const [{ data: contact }, { data: unit }, { data: photos }] = await Promise.all([
    supabase.from("listing_private").select("contact_phone, whatsapp").eq("listing_id", listingId).maybeSingle(),
    supabase.from("units").select("*").eq("id", listing.unit_id).maybeSingle(),
    supabase
      .from("listing_photos")
      .select("id, storage_path, width, height")
      .eq("listing_id", listingId)
      .order("sort_order"),
  ]);
  if (!unit) return null;

  const building = await getMyBuilding(userId, unit.building_id);
  if (!building) return null;

  return {
    listing,
    photos: photos ?? [],
    contact: contact ?? { contact_phone: null, whatsapp: null },
    unit,
    building,
  };
}

/**
 * F10: for the poster's own ad page, whether another ad holds the unit now,
 * and whether a tenancy made on the site is active on it.
 */
export async function getUnitHold(
  listingId: string,
  unitId: string,
): Promise<{ unitHeldByOther: boolean; unitHasTenancy: boolean }> {
  const supabase = await createClient();
  const [{ data: others }, { data: tenancies }] = await Promise.all([
    supabase.from("listings").select("id").eq("unit_id", unitId).neq("id", listingId).in("status", OPEN),
    supabase.from("tenancies").select("id").eq("unit_id", unitId).eq("status", "active").limit(1),
  ]);
  return { unitHeldByOther: Boolean(others?.length), unitHasTenancy: Boolean(tenancies?.length) };
}
