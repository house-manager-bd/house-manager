import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STATUSES } from "@/lib/validation/request";
import type { InboxRow, ListingRow, MyRequestRow, RentalRequestRow } from "@/types/database";

// Loaders for F6 rental requests. They run as the signed-in member; Row
// Level Security decides what each person may read. Admins can read every
// request, so every loader also filters by the person's own role (the
// seeker's own requests, or ads they manage).

/** The seeker's requests, newest first, with a summary of each ad. */
export async function getMyRequests(): Promise<MyRequestRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_requests");
  return data ?? [];
}

/** Ads the landlord manages that have requests, with counts. Cached per request (layout and pages). */
export const getInbox = cache(async (): Promise<InboxRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("request_inbox");
  return data ?? [];
});

/** New (pending) requests on the landlord's ads, for the menu badge and dashboard. */
export async function getNewRequestCount(): Promise<number> {
  const inbox = await getInbox();
  return inbox.reduce((sum, row) => sum + row.pending_count, 0);
}

/** How many open requests the seeker has (the limit is 10). */
export async function getMyOpenRequestCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("rental_requests")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", userId)
    .in("status", [...OPEN_STATUSES]);
  return count ?? 0;
}

/**
 * The seeker's latest request on one ad (open or not), and whether the
 * landlord declined them on this ad before, for the ad page.
 */
export async function getMyRequestForListing(listingId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rental_requests")
    .select("*")
    .eq("listing_id", listingId)
    .eq("tenant_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = data ?? [];
  return {
    latest: rows[0] ?? null,
    open: rows.find((r) => (OPEN_STATUSES as readonly string[]).includes(r.status)) ?? null,
    declined: rows.find((r) => r.status === "declined") ?? null,
  };
}

export type RequestSeeker = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  is_banned: boolean;
  /** Only once the landlord has shortlisted this seeker (RLS on profile_private). */
  phone: string | null;
};

export type InboxRequest = RentalRequestRow & { seeker: RequestSeeker | null };

export type ListingInbox = {
  listing: Pick<ListingRow, "id" | "title" | "status" | "listing_type" | "monthly_rent" | "tenant_types" | "posted_by">;
  requests: InboxRequest[];
};

/**
 * One ad's requests for its landlord. Returns null when the person does not
 * manage the ad (admins included: they read requests, but this page is the
 * landlord's).
 */
export async function getListingInbox(listingId: string): Promise<ListingInbox | null> {
  const supabase = await createClient();
  const [{ data: canManage }, { data: listing }] = await Promise.all([
    supabase.rpc("can_manage_listing", { p_listing_id: listingId }),
    supabase
      .from("listings")
      .select("id, title, status, listing_type, monthly_rent, tenant_types, posted_by")
      .eq("id", listingId)
      .maybeSingle(),
  ]);
  if (!canManage || !listing) return null;

  const { data: requests } = await supabase
    .from("rental_requests")
    .select("*")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false });
  const rows = requests ?? [];
  const seekerIds = [...new Set(rows.map((r) => r.tenant_id))];

  const [{ data: profiles }, { data: phones }] = seekerIds.length
    ? await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url, created_at, is_banned").in("id", seekerIds),
        // Rows come back only for seekers this landlord has shortlisted.
        supabase.from("profile_private").select("user_id, phone").in("user_id", seekerIds),
      ])
    : [{ data: [] }, { data: [] }];

  return {
    listing,
    requests: rows.map((r) => {
      const p = profiles?.find((x) => x.id === r.tenant_id);
      // A phone is shown only on requests that are shortlisted or further.
      const shared = r.status === "shortlisted" || r.status === "offered" || r.status === "confirmed";
      return {
        ...r,
        seeker: p
          ? {
              ...p,
              phone: shared ? (phones?.find((x) => x.user_id === r.tenant_id)?.phone ?? null) : null,
            }
          : null,
      };
    }),
  };
}
