import { z } from "zod";
import { checkbox, optionalInt, optionalText, requiredInt, requiredText } from "./common";

export const AMENITIES = ["lift", "parking", "generator", "security_guard", "cctv", "rooftop"] as const;
export const GAS_TYPES = ["titas_line", "lpg", "none"] as const;
export const NEARBY_KINDS = ["metro", "bus_stop", "market", "school", "hospital", "mosque", "park"] as const;
export const MY_ROLES = ["owner", "caretaker", "tenant"] as const;
export const UNIT_KINDS = ["flat", "room", "mess_room"] as const;
export const FURNISHING = ["unfurnished", "semi_furnished", "furnished"] as const;
export const FACINGS = [
  "north",
  "south",
  "east",
  "west",
  "north_east",
  "north_west",
  "south_east",
  "south_west",
] as const;

const bdLat = z.number({ error: "pinRequired" }).min(20.5, "pinOutside").max(26.7, "pinOutside");
const bdLng = z.number({ error: "pinRequired" }).min(88.0, "pinOutside").max(92.7, "pinOutside");

export const nearbyPlaceSchema = z.object({
  kind: z.enum(NEARBY_KINDS),
  name: requiredText(2, 80),
  walkMinutes: optionalInt(1, 120),
});

export const buildingSchema = z.object({
  // Only asked when the building is created.
  myRole: z.enum(MY_ROLES, { error: "choiceRequired" }),
  name: requiredText(2, 80),
  areaId: requiredInt(1, 999999),
  landmark: optionalText(120),
  totalFloors: optionalInt(1, 60),

  roadAddress: requiredText(3, 200),
  houseNo: optionalText(40),
  lat: bdLat,
  lng: bdLng,

  gas: z.enum(GAS_TYPES),
  amenities: z.array(z.enum(AMENITIES)),
  pets: checkbox,
  smoking: checkbox,
  guestsOvernight: checkbox,
  rooftopUse: checkbox,
  gateClosingTime: z
    .string()
    .trim()
    .refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "timeInvalid"),
  rulesNotes: optionalText(300),

  nearby: z.array(nearbyPlaceSchema).max(10),
});

export type BuildingInput = z.input<typeof buildingSchema>;
export type BuildingValues = z.output<typeof buildingSchema>;

/** Fields checked on each part of the building form (max six per part). */
export const BUILDING_FORM_STEPS = [
  ["myRole", "name", "areaId", "landmark", "totalFloors"],
  ["roadAddress", "houseNo", "lat", "lng"],
  ["gas", "amenities", "pets", "smoking", "guestsOvernight", "rooftopUse", "gateClosingTime", "rulesNotes"],
  ["nearby"],
] as const satisfies readonly (readonly (keyof BuildingInput)[])[];

export const unitSchema = z
  .object({
    label: requiredText(1, 40),
    unitKind: z.enum(UNIT_KINDS, { error: "choiceRequired" }),
    floorNo: optionalInt(0, 60),
    sizeSqft: optionalInt(50, 20000),
    bedrooms: optionalInt(0, 20),
    bathrooms: optionalInt(0, 20),
    balconies: optionalInt(0, 20),
    facing: z.preprocess((v) => (v === "" ? null : v), z.enum(FACINGS).nullable()),
    furnishing: z.enum(FURNISHING),
    capacity: optionalInt(1, 30),
  })
  .transform((v) => ({
    ...v,
    // Beds only matter for a mess room. Flats and rooms hold one tenant group.
    capacity: v.unitKind === "mess_room" ? (v.capacity ?? 1) : 1,
  }));

export type UnitInput = z.input<typeof unitSchema>;
export type UnitValues = z.output<typeof unitSchema>;
