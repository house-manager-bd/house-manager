import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_PAGE_SIZE, type NotificationCursor } from "@/lib/notifications";
import type { NotificationRow } from "@/types/database";

// Loaders for F9 notifications. They run as the signed-in member; RLS lets
// each member read only their own notifications and settings.

/**
 * The bell's number. Cached per request (the header asks on every page).
 * 0 on any error, so a page never breaks over the bell (for example before
 * the F9 migration has run).
 */
export const getUnreadNotificationCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unread_notification_count");
  if (error || typeof data !== "number") return 0;
  return data;
});

export type NotificationPage = {
  items: NotificationRow[];
  /** Where the next page starts, when older notifications exist. */
  next: NotificationCursor | null;
};

/**
 * Newest first, NOTIFICATION_PAGE_SIZE at a time. `before` continues after an
 * earlier page. Notifications written in one transaction share created_at,
 * so the id breaks ties.
 */
export async function getNotifications(before?: NotificationCursor | null): Promise<NotificationPage> {
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE + 1);
  if (before) {
    query = query.or(
      `created_at.lt."${before.at}",and(created_at.eq."${before.at}",id.lt.${before.id})`,
    );
  }
  const { data } = await query;
  const rows = data ?? [];
  const items = rows.slice(0, NOTIFICATION_PAGE_SIZE);
  const last = items[items.length - 1];
  return {
    items,
    next: rows.length > NOTIFICATION_PAGE_SIZE && last ? { at: last.created_at, id: last.id } : null,
  };
}

/** Whether the member wants emails. No row means the default: on. */
export async function getEmailNotificationsEnabled(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("notification_settings").select("email_enabled").maybeSingle();
  return data?.email_enabled ?? true;
}

/**
 * When the newest unread notification about one request was written, or
 * null when there is none, so the request's page can mark them read (again
 * whenever a new one arrives while it is open).
 */
export async function getRequestNewestUnread(requestId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("created_at")
    .eq("request_id", requestId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ?? null;
}
