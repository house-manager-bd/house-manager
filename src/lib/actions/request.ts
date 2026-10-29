"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  declineRequestSchema,
  requestIdSchema,
  sendRequestSchema,
  type DeclineRequestInput,
  type SendRequestInput,
} from "@/lib/validation/request";
import { dbErrorKey, fromZodError, type ActionResult, type ErrorKey } from "./result";

// F6 rental requests. Each action checks the input with the shared schema,
// then calls one database function, which checks the caller, the status and
// the limits again in one transaction.

/** Like dbErrorKey, but "wrong status" is about the request here, not the ad. */
function requestErrorKey(error: { code?: string; message?: string } | null): ErrorKey {
  if (error?.message === "wrong_status") return "requestChanged";
  return dbErrorKey(error);
}

/** A member sends a request for a live ad (FR21, FR24). */
export async function sendRequest(input: SendRequestInput): Promise<ActionResult<{ id: string }>> {
  const parsed = sendRequestSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_request", {
    p_listing_id: v.listingId,
    p_household_type: v.householdType,
    p_members_count: v.membersCount,
    p_occupation: v.occupation,
    p_move_in_date: v.moveInDate,
    p_message: v.message ?? null,
  });
  if (error || !data) {
    if (error?.message === "not_authenticated") return { ok: false, error: "loginRequired" };
    // Two sends at the same moment: the second one hits the "one open
    // request per ad" index.
    if (error?.code === "23505") return { ok: false, error: "alreadyRequested" };
    return { ok: false, error: dbErrorKey(error) };
  }
  revalidatePath("/[locale]", "layout");
  return { ok: true, data: { id: data } };
}

/** The landlord shortlists a request; the seeker's phone is shared (FR22, FR23). */
export async function shortlistRequest(requestId: string): Promise<ActionResult> {
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("shortlist_request", { p_request_id: parsed.data });
  if (error) return { ok: false, error: requestErrorKey(error) };
  revalidatePath("/[locale]", "layout");
  return { ok: true };
}

/** The landlord declines a request with a reason the seeker sees (FR22). */
export async function declineRequest(input: DeclineRequestInput): Promise<ActionResult> {
  const parsed = declineRequestSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_request", {
    p_request_id: v.requestId,
    p_reason: v.reason,
    p_note: v.note ?? null,
  });
  if (error) return { ok: false, error: requestErrorKey(error) };
  revalidatePath("/[locale]", "layout");
  return { ok: true };
}

/** The seeker withdraws their request (FR24). */
export async function withdrawRequest(requestId: string): Promise<ActionResult> {
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_request", { p_request_id: parsed.data });
  if (error) return { ok: false, error: requestErrorKey(error) };
  revalidatePath("/[locale]", "layout");
  return { ok: true };
}
