import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BuildingTeamRow, MyBuildingInviteRow } from "@/types/database";

// F10 caretakers (FR36).

/** A building's owner and caretakers, and (for owners) the waiting invitations. */
export async function getBuildingTeam(buildingId: string): Promise<BuildingTeamRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("building_team", { p_building_id: buildingId });
  return data ?? [];
}

/** Invitations waiting for the signed-in member (matched by their confirmed email). */
export async function getMyBuildingInvites(): Promise<MyBuildingInviteRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_building_invites");
  return data ?? [];
}
