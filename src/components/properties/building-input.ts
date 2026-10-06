import type { BuildingDetail } from "@/lib/data/properties";
import type { BuildingInput } from "@/lib/validation/property";

/** Turns a saved building into form values for editing. */
export function buildingToInput(b: BuildingDetail): BuildingInput {
  const rules = b.house_rules ?? {};
  return {
    myRole: b.myRole,
    name: b.name,
    areaId: b.area_id,
    landmark: b.landmark ?? "",
    totalFloors: b.total_floors === null ? "" : String(b.total_floors),
    roadAddress: b.private?.road_address ?? "",
    houseNo: b.private?.house_no ?? "",
    lat: b.private?.exact_lat ?? b.approx_lat,
    lng: b.private?.exact_lng ?? b.approx_lng,
    gas: b.gas,
    amenities: b.amenities as BuildingInput["amenities"],
    pets: rules.pets ?? false,
    smoking: rules.smoking ?? false,
    guestsOvernight: rules.guests_overnight ?? true,
    rooftopUse: rules.rooftop_use ?? false,
    gateClosingTime: rules.gate_closing_time ?? "",
    rulesNotes: rules.notes ?? "",
    nearby: b.nearby.map((n) => ({
      kind: n.kind,
      name: n.name,
      walkMinutes: n.walk_minutes === null ? "" : String(n.walk_minutes),
    })),
  };
}
