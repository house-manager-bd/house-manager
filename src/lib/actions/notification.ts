"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { notificationTarget } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { emailNotificationsSchema, notificationIdSchema } from "@/lib/validation/notification";
import { requestIdSchema } from "@/lib/validation/request";
import { dbErrorKey, type ActionResult } from "./result";

// F9 notifications. Marking read and the email choice go through database
// functions that only touch the caller's own rows.

/**
 * Opens one notification from the list (a form, so it also works without
 * JavaScript): marks it read, then goes to the page it is about.
 */
export async function openNotification(formData: FormData): Promise<void> {
  const locale = (await getLocale()) as "bn" | "en";
  const parsed = notificationIdSchema.safeParse(formData.get("id"));
  if (!parsed.success) return redirect({ href: "/dashboard/notifications", locale });

  const supabase = await createClient();
  const { data: n } = await supabase
    .from("notifications")
    .select("id, type, request_id, listing_id, read_at")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!n) return redirect({ href: "/dashboard/notifications", locale });
  if (!n.read_at) await supabase.rpc("mark_notifications_read", { p_notification_id: n.id });
  return redirect({ href: notificationTarget(n).href, locale });
}

/** Marks every notification of the member as read. */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", {});
  if (error) return { ok: false, error: dbErrorKey(error) };
  revalidatePath("/[locale]", "layout");
  return { ok: true };
}

/**
 * Marks the notifications about one request as read, when its page is
 * opened. No revalidation: the bell updates itself (Realtime and the read
 * event).
 */
export async function markRequestNotificationsRead(requestId: string): Promise<ActionResult> {
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_request_id: parsed.data });
  if (error) return { ok: false, error: dbErrorKey(error) };
  return { ok: true };
}

/** Turns notification emails on or off for the member. */
export async function setEmailNotifications(enabled: boolean): Promise<ActionResult> {
  const parsed = emailNotificationsSchema.safeParse(enabled);
  if (!parsed.success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_email_notifications", { p_enabled: parsed.data });
  if (error) return { ok: false, error: dbErrorKey(error) };
  revalidatePath("/[locale]/dashboard/notifications", "page");
  return { ok: true };
}
