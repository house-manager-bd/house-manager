import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ListingRow, UnitRow } from "@/types/database";
import { getMyBuilding, type BuildingDetail } from "./properties";

export type MyListing = ListingRow & {
  unit: Pick<UnitRow, "id" | "label" | "unit_kind"> | null;
  buildingName: string;
  areaId: number | null;
};

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
    .select("id, label, unit_kind, building_id")
    .in("id", unitIds);
  const buildingIds = [...new Set((units ?? []).map((u) => u.building_id))];
  const { data: buildings } = buildingIds.length
    ? await supabase.from("buildings").select("id, name, area_id").in("id", buildingIds)
    : { data: [] };

  return listings.map((l) => {
    const unit = units?.find((u) => u.id === l.unit_id) ?? null;
    const building = buildings?.find((b) => b.id === unit?.building_id);
    return {
      ...l,
      unit: unit ? { id: unit.id, label: unit.label, unit_kind: unit.unit_kind } : null,
      buildingName: building?.name ?? "",
      areaId: building?.area_id ?? null,
    };
  });
}

export type DraftForWizard = {
  listing: ListingRow;
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

  const [{ data: contact }, { data: unit }] = await Promise.all([
    supabase.from("listing_private").select("contact_phone, whatsapp").eq("listing_id", listingId).maybeSingle(),
    supabase.from("units").select("*").eq("id", listing.unit_id).maybeSingle(),
  ]);
  if (!unit) return null;

  const building = await getMyBuilding(userId, unit.building_id);
  if (!building) return null;

  return {
    listing,
    contact: contact ?? { contact_phone: null, whatsapp: null },
    unit,
    building,
  };
}
