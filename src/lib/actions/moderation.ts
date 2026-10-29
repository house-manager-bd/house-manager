"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  banSchema,
  moderateSchema,
  reportSchema,
  type BanInput,
  type ModerateInput,
  type ReportInput,
} from "@/lib/validation/moderation";
import type { ListingStatus } from "@/types/database";
import { dbErrorKey, fromZodError, type ActionResult } from "./result";

/**
 * A member reports a live ad (FR19). One report per member per ad, 10 a
 * day. Three reports from different members hide the ad until an admin
 * checks it; the database does that in the same transaction.
 */
export async function reportListing(input: ReportInput): Promise<ActionResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_listing", {
    p_listing_id: v.listingId,
    p_reason: v.reason,
    p_details: v.details ?? null,
  });
  if (error) {
    if (error.message === "not_authenticated") return { ok: false, error: "loginRequired" };
    return { ok: false, error: dbErrorKey(error) };
  }
  // No revalidatePath here: the third report hides the ad, and re-rendering
  // the page would replace the "thank you" note with "page not found".
  return { ok: true };
}

/** Admin: approve, reject (with a reason), hide or restore one ad (FR20). */
export async function moderateListing(input: ModerateInput): Promise<ActionResult<{ status: ListingStatus }>> {
  const parsed = moderateSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("moderate_listing", {
    p_listing_id: v.listingId,
    p_action: v.action,
    p_note: v.note ?? null,
  });
  if (error || !data) return { ok: false, error: dbErrorKey(error) };
  revalidatePath("/[locale]", "layout");
  return { ok: true, data: { status: data } };
}

/** Admin: ban (with a reason) or unban a member (FR20). */
export async function setUserBan(input: BanInput): Promise<ActionResult> {
  const parsed = banSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_ban", {
    p_user_id: v.userId,
    p_banned: v.banned,
    p_note: v.note ?? null,
  });
  if (error) return { ok: false, error: dbErrorKey(error) };
  revalidatePath("/[locale]", "layout");
  return { ok: true };
}
