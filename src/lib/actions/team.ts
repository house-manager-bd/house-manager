"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendNotificationEmailsLater } from "@/lib/email/deliver";
import { createClient } from "@/lib/supabase/server";
import { inviteCaretakerSchema, type InviteCaretakerInput } from "@/lib/validation/team";
import { dbErrorKey, fromZodError, type ActionResult } from "./result";

// F10: caretakers (FR36). The building's owner invites a member by email;
// the member accepts on My properties and becomes a building manager.

const uuid = z.uuid();

/**
 * The answer is the same whether or not the email belongs to a member, so
 * nobody can use the form to find out who has an account.
 */
export async function inviteCaretaker(input: InviteCaretakerInput): Promise<ActionResult> {
  const parsed = inviteCaretakerSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_caretaker", {
    p_building_id: parsed.data.buildingId,
    p_email: parsed.data.email,
  });
  if (error) {
    if (error.message === "email_invalid") return { ok: false, error: "emailInvalid", fieldErrors: { email: "emailInvalid" } };
    return { ok: false, error: dbErrorKey(error) };
  }
  sendNotificationEmailsLater();
  revalidatePath("/[locale]/dashboard/properties", "layout");
  return { ok: true };
}

export async function cancelBuildingInvite(inviteId: string): Promise<ActionResult> {
  if (!uuid.safeParse(inviteId).success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_building_invite", { p_invite_id: inviteId });
  if (error) return { ok: false, error: dbErrorKey(error) };
  revalidatePath("/[locale]/dashboard/properties", "layout");
  return { ok: true };
}

/** The invited member accepts or declines. Returns the building's id. */
export async function respondBuildingInvite(
  inviteId: string,
  accept: boolean,
): Promise<ActionResult<{ buildingId: string }>> {
  if (!uuid.safeParse(inviteId).success || typeof accept !== "boolean") return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_building_invite", { p_invite_id: inviteId, p_accept: accept });
  if (error || !data) return { ok: false, error: dbErrorKey(error) };
  sendNotificationEmailsLater();
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true, data: { buildingId: data } };
}

/** The owner removes a caretaker, or a caretaker leaves (userId is their own id). */
export async function removeBuildingManager(buildingId: string, userId: string): Promise<ActionResult> {
  if (!uuid.safeParse(buildingId).success || !uuid.safeParse(userId).success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_building_manager", { p_building_id: buildingId, p_user_id: userId });
  if (error) return { ok: false, error: dbErrorKey(error) };
  sendNotificationEmailsLater();
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true };
}
