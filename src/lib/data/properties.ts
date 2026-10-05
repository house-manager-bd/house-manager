import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  BuildingPrivateRow,
  BuildingRow,
  ListingRow,
  ManagerRole,
  NearbyKind,
  UnitRow,
} from "@/types/database";

export type MyRole = ManagerRole | "tenant";

export type MyBuilding = BuildingRow & {
  myRole: MyRole;
  units: (UnitRow & { openListing: Pick<ListingRow, "id" | "status" | "posted_by"> | null })[];
};

export type BuildingDetail = MyBuilding & {
  private: BuildingPrivateRow | null;
  nearby: { kind: NearbyKind; name: string; walk_minutes: number | null }[];
};

const OPEN_STATUSES = ["draft", "pending_review", "active", "hidden"] as const;

/**
 * Buildings the user owns, manages or added, with their units and each
 * unit's open ad. (RLS also shows other people's buildings that have a live
 * ad, so this filters to the user's own.)
 */
export async function getMyBuildings(userId: string): Promise<MyBuilding[]> {
  const supabase = await createClient();

  const { data: roles } = await supabase
    .from("building_managers")
    .select("building_id, role")
    .eq("user_id", userId);
  const managedIds = (roles ?? []).map((r) => r.building_id);

  let query = supabase.from("buildings").select("*").order("created_at", { ascending: true });
  query = managedIds.length
    ? query.or(`created_by.eq.${userId},id.in.(${managedIds.join(",")})`)
    : query.eq("created_by", userId);
  const { data: buildings } = await query;
  if (!buildings?.length) return [];

  const ids = buildings.map((b) => b.id);
  const { data: units } = await supabase
    .from("units")
    .select("*")
    .in("building_id", ids)
    .order("label");
  const unitIds = (units ?? []).map((u) => u.id);
  const { data: listings } = unitIds.length
    ? await supabase
        .from("listings")
        .select("id, status, posted_by, unit_id")
        .in("unit_id", unitIds)
        .in("status", [...OPEN_STATUSES])
    : { data: [] };

  return buildings.map((b) => ({
    ...b,
    approx_lat: Number(b.approx_lat),
    approx_lng: Number(b.approx_lng),
    myRole: (roles?.find((r) => r.building_id === b.id)?.role ?? "tenant") as MyRole,
    units: (units ?? [])
      .filter((u) => u.building_id === b.id)
      .map((u) => ({
        ...u,
        openListing: listings?.find((l) => l.unit_id === u.id) ?? null,
      })),
  }));
}

/** One of the user's buildings with its private address and nearby places. */
export async function getMyBuilding(userId: string, buildingId: string): Promise<BuildingDetail | null> {
  const all = await getMyBuildings(userId);
  const building = all.find((b) => b.id === buildingId);
  if (!building) return null;

  const supabase = await createClient();
  const [{ data: priv }, { data: nearby }] = await Promise.all([
    supabase.from("building_private").select("*").eq("building_id", buildingId).maybeSingle(),
    supabase.from("nearby_places").select("kind, name, walk_minutes").eq("building_id", buildingId),
  ]);

  return {
    ...building,
    private: priv ? { ...priv, exact_lat: Number(priv.exact_lat), exact_lng: Number(priv.exact_lng) } : null,
    nearby: nearby ?? [],
  };
}
