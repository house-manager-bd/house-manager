"use server";

import { revalidatePath } from "next/cache";
import { sendNotificationEmailsLater } from "@/lib/email/deliver";
import { createClient } from "@/lib/supabase/server";
import { requestIdSchema } from "@/lib/validation/request";
import {
  addViewingSlotsSchema,
  bookViewingSchema,
  type AddViewingSlotsInput,
  type BookViewingInput,
} from "@/lib/validation/viewing";
import { dbErrorKey, fromZodError, type ActionResult, type ErrorKey } from "./result";

// F11 viewing slots. Each action checks the input with the shared schema,
// then calls one database function, which checks the caller, the request,
// the ad and the limits again in one transaction.

function viewingErrorKey(error: { code?: string; message?: string } | null): ErrorKey {
  if (error?.message === "wrong_status") return "requestChanged";
  if (error?.message === "not_authenticated") return "loginRequired";
  return dbErrorKey(error);
}

/** The landlord side adds visit times to a live ad. Returns how many were added. */
export async function addViewingSlots(input: AddViewingSlotsInput): Promise<ActionResult<{ count: number }>> {
  const parsed = addViewingSlotsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_viewing_slots", {
    p_listing_id: v.listingId,
    p_date: v.date,
    p_from: v.from,
    p_to: v.to,
    p_minutes: v.minutes,
  });
  if (error || typeof data !== "number") return { ok: false, error: viewingErrorKey(error) };
  revalidatePath("/[locale]", "layout");
  // Shortlisted members without a visit hear about the new times.
  sendNotificationEmailsLater();
  return { ok: true, data: { count: data } };
}

/** The landlord side removes a time that has not started; a member who booked it is told. */
export async function removeViewingSlot(slotId: string): Promise<ActionResult> {
  const parsed = requestIdSchema.safeParse(slotId);
  if (!parsed.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_viewing_slot", { p_slot_id: parsed.data });
  if (error) return { ok: false, error: viewingErrorKey(error) };
  revalidatePath("/[locale]", "layout");
  sendNotificationEmailsLater();
  return { ok: true };
}

/** A shortlisted member books a free time; a visit already booked moves to it. */
export async function bookViewing(input: BookViewingInput): Promise<ActionResult<{ startsAt: string }>> {
  const parsed = bookViewingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_viewing", {
    p_request_id: parsed.data.requestId,
    p_slot_id: parsed.data.slotId,
  });
  if (error || !data) return { ok: false, error: viewingErrorKey(error) };
  revalidatePath("/[locale]", "layout");
  sendNotificationEmailsLater();
  return { ok: true, data: { startsAt: data } };
}

/** The member cancels their coming visit; the landlord side is told. */
export async function cancelViewing(requestId: string): Promise<ActionResult> {
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_viewing", { p_request_id: parsed.data });
  if (error) return { ok: false, error: viewingErrorKey(error) };
  revalidatePath("/[locale]", "layout");
  sendNotificationEmailsLater();
  return { ok: true };
}
