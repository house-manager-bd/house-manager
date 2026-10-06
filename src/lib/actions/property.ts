"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildingSchema, unitSchema, type BuildingInput, type UnitInput } from "@/lib/validation/property";
import { dbErrorKey, fromZodError, type ActionResult } from "./result";

export async function saveBuilding(
  buildingId: string | null,
  input: BuildingInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = buildingSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_building", {
    p_building_id: buildingId,
    p_data: {
      name: v.name,
      my_role: v.myRole,
      area_id: v.areaId,
      landmark: v.landmark ?? null,
      total_floors: v.totalFloors,
      road_address: v.roadAddress,
      house_no: v.houseNo ?? null,
      exact_lat: v.lat,
      exact_lng: v.lng,
      gas: v.gas,
      amenities: v.amenities,
      house_rules: {
        pets: v.pets,
        smoking: v.smoking,
        guests_overnight: v.guestsOvernight,
        rooftop_use: v.rooftopUse,
        gate_closing_time: v.gateClosingTime || null,
        notes: v.rulesNotes ?? null,
      },
      nearby: v.nearby.map((n) => ({ kind: n.kind, name: n.name, walk_minutes: n.walkMinutes })),
    },
  });

  if (error || !data) return { ok: false, error: dbErrorKey(error) };
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true, data: { id: data } };
}

export async function saveUnit(
  buildingId: string,
  unitId: string | null,
  input: UnitInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const row = {
    label: v.label,
    unit_kind: v.unitKind,
    floor_no: v.floorNo,
    size_sqft: v.sizeSqft,
    bedrooms: v.bedrooms,
    bathrooms: v.bathrooms,
    balconies: v.balconies,
    facing: v.facing,
    furnishing: v.furnishing,
    capacity: v.capacity,
  };

  const supabase = await createClient();
  const result = unitId
    ? await supabase.from("units").update(row).eq("id", unitId).eq("building_id", buildingId).select("id").maybeSingle()
    : await supabase.from("units").insert({ ...row, building_id: buildingId }).select("id").maybeSingle();

  if (result.error || !result.data) return { ok: false, error: dbErrorKey(result.error) };
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true, data: { id: result.data.id } };
}

export async function deleteUnit(buildingId: string, unitId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("units")
    .delete({ count: "exact" })
    .eq("id", unitId)
    .eq("building_id", buildingId);
  if (error) return { ok: false, error: error.code === "23503" ? "unitHasAds" : dbErrorKey(error) };
  if (!count) return { ok: false, error: "notAllowed" };
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true };
}
