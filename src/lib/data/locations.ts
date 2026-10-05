import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type LocationTree = {
  divisions: { id: number; name_en: string; name_bn: string }[];
  districts: { id: number; division_id: number; name_en: string; name_bn: string }[];
  thanas: { id: number; district_id: number; name_en: string; name_bn: string }[];
  areas: {
    id: number;
    thana_id: number;
    name_en: string;
    name_bn: string;
    center_lat: number;
    center_lng: number;
  }[];
};

/** All divisions, districts, thanas and areas. Small enough to load at once. */
export const getLocationTree = cache(async (): Promise<LocationTree> => {
  const supabase = await createClient();
  const [divisions, districts, thanas, areas] = await Promise.all([
    supabase.from("divisions").select("*").order("name_en"),
    supabase.from("districts").select("*").order("name_en"),
    supabase.from("thanas").select("*").order("name_en"),
    supabase.from("areas").select("*").order("id"),
  ]);
  return {
    divisions: divisions.data ?? [],
    districts: districts.data ?? [],
    thanas: thanas.data ?? [],
    areas: (areas.data ?? []).map((a) => ({
      ...a,
      center_lat: Number(a.center_lat),
      center_lng: Number(a.center_lng),
    })),
  };
});

/** "Mirpur 10, Mirpur Model" style label for an area. */
export function areaLabel(tree: LocationTree, areaId: number, locale: string) {
  const area = tree.areas.find((a) => a.id === areaId);
  if (!area) return "";
  const thana = tree.thanas.find((t) => t.id === area.thana_id);
  const pick = (r: { name_en: string; name_bn: string }) => (locale === "bn" ? r.name_bn : r.name_en);
  return thana ? `${pick(area)}, ${pick(thana)}` : pick(area);
}
