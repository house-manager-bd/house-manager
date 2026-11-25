import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  ListingRow,
  ListingViewingSlotRow,
  RequestViewings,
  UpcomingViewingRow,
  ViewingTime,
} from "@/types/database";

// F11 viewing slots. The functions check the caller: the landlord side sees
// every time of its ads, a member the free times while they can book and
// their own visit. Everybody else (admins included) gets nothing.

/** Visits on one request's page, for either side; null when the caller is neither. */
export async function getRequestViewings(requestId: string): Promise<RequestViewings | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("request_viewings", { p_request_id: requestId });
  if (!data) return null;
  const address = data.address
    ? { ...data.address, exact_lat: Number(data.address.exact_lat), exact_lng: Number(data.address.exact_lng) }
    : null;
  return { ...data, free: data.free ?? [], address };
}

export type ViewingsPage = {
  listing: Pick<ListingRow, "id" | "title" | "status" | "listing_type" | "paused_at">;
  slots: ListingViewingSlotRow[];
};

/** One ad's times for its landlord side, or null when the caller does not manage the ad. */
export async function getViewingsPage(listingId: string): Promise<ViewingsPage | null> {
  const supabase = await createClient();
  const [{ data: canManage }, { data: listing }, { data: slots }] = await Promise.all([
    supabase.rpc("can_manage_listing", { p_listing_id: listingId }),
    supabase.from("listings").select("id, title, status, listing_type, paused_at").eq("id", listingId).maybeSingle(),
    supabase.rpc("listing_viewing_slots", { p_listing_id: listingId }),
  ]);
  if (!canManage || !listing) return null;
  return { listing, slots: slots ?? [] };
}

/**
 * The coming visit of each of these requests, for request lists (both
 * sides; RLS shows the landlord side its ads' times and members their own).
 */
export async function getBookedViewings(requestIds: string[]): Promise<Map<string, ViewingTime>> {
  const out = new Map<string, ViewingTime>();
  if (requestIds.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase
    .from("viewing_slots")
    .select("id, starts_at, ends_at, booked_request_id")
    .in("booked_request_id", requestIds)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at");
  for (const row of data ?? []) {
    if (row.booked_request_id && !out.has(row.booked_request_id)) {
      out.set(row.booked_request_id, { id: row.id, starts_at: row.starts_at, ends_at: row.ends_at });
    }
  }
  return out;
}

/** How many times each of these ads has coming up, and how many are booked (My ads, the inbox). */
export async function getUpcomingSlotCounts(listingIds: string[]): Promise<Map<string, { total: number; booked: number }>> {
  const out = new Map<string, { total: number; booked: number }>();
  if (listingIds.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase
    .from("viewing_slots")
    .select("listing_id, booked_request_id")
    .in("listing_id", listingIds)
    .gt("starts_at", new Date().toISOString());
  for (const row of data ?? []) {
    const c = out.get(row.listing_id) ?? { total: 0, booked: 0 };
    c.total += 1;
    if (row.booked_request_id) c.booked += 1;
    out.set(row.listing_id, c);
  }
  return out;
}

/** The caller's coming visits on both sides, soonest first (the dashboard). */
export async function getMyUpcomingViewings(limit = 5): Promise<UpcomingViewingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_upcoming_viewings", { p_limit: limit });
  return data ?? [];
}
