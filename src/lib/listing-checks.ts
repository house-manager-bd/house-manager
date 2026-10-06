import { MIN_PHOTOS } from "@/lib/photos";
import type { ListingRow, UnitRow } from "@/types/database";

/** The wizard step where each required field lives. */
export const FIELD_STEP: Record<string, 3 | 4 | 5 | 6> = {
  title: 3,
  available_from: 3,
  owner_name: 3,
  sublet_consent: 3,
  listing_type: 3,
  monthly_rent: 4,
  advance_months: 4,
  electricity: 4,
  water: 4,
  tenant_types: 5,
  contact_phone: 5,
  open_slots: 5,
  photos: 6,
};

/** Same rules as submit_listing() in the database, to show them early. */
export function missingFields(
  l: ListingRow,
  contactPhone: string | null,
  unit: Pick<UnitRow, "unit_kind" | "capacity">,
  photoCount: number,
): string[] {
  const missing: string[] = [];
  if (!l.title) missing.push("title");
  if (!l.available_from) missing.push("available_from");
  if (l.monthly_rent === null) missing.push("monthly_rent");
  if (l.advance_months === null) missing.push("advance_months");
  if (!l.electricity) missing.push("electricity");
  if (!l.water) missing.push("water");
  if (l.tenant_types.length === 0) missing.push("tenant_types");
  if (!contactPhone) missing.push("contact_phone");
  if (l.posted_as === "caretaker" && !l.owner_name) missing.push("owner_name");
  if (l.posted_as === "tenant_sublet" && !l.sublet_consent) missing.push("sublet_consent");
  if (l.listing_type === "mess_seat" && unit.unit_kind !== "mess_room") missing.push("listing_type");
  if (l.open_slots > unit.capacity) missing.push("open_slots");
  if (photoCount < MIN_PHOTOS) missing.push("photos");
  return missing;
}
