import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminUserRow,
  Json,
  ListingFlag,
  ListingRow,
  ListingStatus,
  ModerationAction,
  ReportReason,
} from "@/types/database";
import type { UserFilter } from "@/lib/validation/moderation";

// Loaders for the admin pages (F5). They run as the signed-in admin: Row
// Level Security lets admins read every ad, its building, flags, reports and
// the moderation log. Nothing here uses a secret key.

export type AdminPoster = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  trust_level: number;
  is_banned: boolean;
};

export type AdminFlag = { flag: ListingFlag; detail: { [key: string]: Json | undefined } };

export type AdminReport = {
  id: string;
  reason: ReportReason;
  details: string | null;
  created_at: string;
  reporter: { id: string; full_name: string } | null;
};

export type AdminLogEntry = {
  id: string;
  action: ModerationAction;
  note: string | null;
  created_at: string;
  admin: { id: string; full_name: string } | null;
  listing: { id: string; title: string | null } | null;
  user: { id: string; full_name: string } | null;
};

export type AdminAd = Pick<
  ListingRow,
  | "id"
  | "title"
  | "status"
  | "listing_type"
  | "monthly_rent"
  | "submitted_at"
  | "published_at"
  | "updated_at"
  | "rejection_reason"
> & {
  unitLabel: string | null;
  buildingName: string | null;
  areaId: number | null;
  coverPath: string | null;
  photoCount: number;
  poster: AdminPoster | null;
  flags: AdminFlag[];
  openReports: AdminReport[];
  lastAction: AdminLogEntry | null;
};

const LISTING_COLUMNS =
  "id, title, status, listing_type, monthly_rent, submitted_at, published_at, updated_at, rejection_reason, unit_id, posted_by";
type ListingSlice = Pick<
  ListingRow,
  | "id"
  | "title"
  | "status"
  | "listing_type"
  | "monthly_rent"
  | "submitted_at"
  | "published_at"
  | "updated_at"
  | "rejection_reason"
  | "unit_id"
  | "posted_by"
>;

async function names(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

/** Adds the unit, building, photos, poster, flags, open reports and last action. */
async function enrich(listings: ListingSlice[]): Promise<AdminAd[]> {
  if (!listings.length) return [];
  const supabase = await createClient();
  const ids = listings.map((l) => l.id);
  const unitIds = [...new Set(listings.map((l) => l.unit_id))];
  const posterIds = [...new Set(listings.map((l) => l.posted_by))];

  const [{ data: units }, { data: photos }, { data: posters }, { data: flags }, { data: reports }, { data: actions }] =
    await Promise.all([
      supabase.from("units").select("id, label, building_id").in("id", unitIds),
      supabase.from("listing_photos").select("listing_id, storage_path, sort_order").in("listing_id", ids),
      supabase
        .from("profiles")
        .select("id, full_name, avatar_url, created_at, trust_level, is_banned")
        .in("id", posterIds),
      supabase.from("listing_flags").select("listing_id, flag, detail").in("listing_id", ids),
      supabase
        .from("reports")
        .select("id, listing_id, reporter_id, reason, details, created_at")
        .in("listing_id", ids)
        .eq("status", "open")
        .order("created_at"),
      supabase
        .from("moderation_actions")
        .select("id, listing_id, admin_id, user_id, action, note, created_at")
        .in("listing_id", ids)
        .order("created_at", { ascending: false }),
    ]);

  const buildingIds = [...new Set((units ?? []).map((u) => u.building_id))];
  const [{ data: buildings }, people] = await Promise.all([
    buildingIds.length
      ? supabase.from("buildings").select("id, name, area_id").in("id", buildingIds)
      : Promise.resolve({ data: [] as { id: string; name: string; area_id: number }[] }),
    names([...(reports ?? []).map((r) => r.reporter_id), ...(actions ?? []).map((a) => a.admin_id)]),
  ]);

  return listings.map((l) => {
    const unit = units?.find((u) => u.id === l.unit_id);
    const building = buildings?.find((b) => b.id === unit?.building_id);
    const own = (photos ?? []).filter((p) => p.listing_id === l.id).sort((a, b) => a.sort_order - b.sort_order);
    const last = actions?.find((a) => a.listing_id === l.id);
    return {
      id: l.id,
      title: l.title,
      status: l.status,
      listing_type: l.listing_type,
      monthly_rent: l.monthly_rent,
      submitted_at: l.submitted_at,
      published_at: l.published_at,
      updated_at: l.updated_at,
      rejection_reason: l.rejection_reason,
      unitLabel: unit?.label ?? null,
      buildingName: building?.name ?? null,
      areaId: building?.area_id ?? null,
      coverPath: own[0]?.storage_path ?? null,
      photoCount: own.length,
      poster: posters?.find((p) => p.id === l.posted_by) ?? null,
      flags: (flags ?? []).filter((f) => f.listing_id === l.id).map((f) => ({ flag: f.flag, detail: f.detail })),
      openReports: (reports ?? [])
        .filter((r) => r.listing_id === l.id)
        .map((r) => ({
          id: r.id,
          reason: r.reason,
          details: r.details,
          created_at: r.created_at,
          reporter: { id: r.reporter_id, full_name: people.get(r.reporter_id) ?? "" },
        })),
      lastAction: last
        ? {
            id: last.id,
            action: last.action,
            note: last.note,
            created_at: last.created_at,
            admin: last.admin_id ? { id: last.admin_id, full_name: people.get(last.admin_id) ?? "" } : null,
            listing: null,
            user: null,
          }
        : null,
    };
  });
}

/** Ads waiting for review, oldest first (FR18). */
export async function getReviewQueue(): Promise<AdminAd[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "pending_review")
    .order("submitted_at", { ascending: true })
    .limit(100);
  return enrich(data ?? []);
}

/** Hidden ads (by 3 reports, by an admin, or by a ban), newest first. */
export async function getHiddenAds(): Promise<AdminAd[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "hidden")
    .order("updated_at", { ascending: false })
    .limit(100);
  return enrich(data ?? []);
}

/** Ads with open reports, most reported first. */
export async function getReportedAds(): Promise<AdminAd[]> {
  const supabase = await createClient();
  const { data: open } = await supabase.from("reports").select("listing_id").eq("status", "open").limit(1000);
  const ids = [...new Set((open ?? []).map((r) => r.listing_id))];
  if (!ids.length) return [];
  const { data } = await supabase.from("listings").select(LISTING_COLUMNS).in("id", ids);
  const ads = await enrich(data ?? []);
  return ads.sort(
    (a, b) =>
      b.openReports.length - a.openReports.length ||
      (a.openReports[0]?.created_at ?? "").localeCompare(b.openReports[0]?.created_at ?? ""),
  );
}

export type AdminCounts = { review: number; hidden: number; reported: number; banned: number };

export async function getAdminCounts(): Promise<AdminCounts> {
  const supabase = await createClient();
  const [review, hidden, open, banned] = await Promise.all([
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "hidden"),
    supabase.from("reports").select("listing_id").eq("status", "open").limit(1000),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_banned", true),
  ]);
  return {
    review: review.count ?? 0,
    hidden: hidden.count ?? 0,
    reported: new Set((open.data ?? []).map((r) => r.listing_id)).size,
    banned: banned.count ?? 0,
  };
}

/** The latest admin decisions, for the overview page. */
export async function getRecentActions(limit = 20): Promise<AdminLogEntry[]> {
  const supabase = await createClient();
  const { data: actions } = await supabase
    .from("moderation_actions")
    .select("id, listing_id, admin_id, user_id, action, note, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!actions?.length) return [];
  const listingIds = [...new Set(actions.map((a) => a.listing_id).filter((id): id is string => Boolean(id)))];
  const [people, { data: listings }] = await Promise.all([
    names(actions.flatMap((a) => [a.admin_id, a.user_id])),
    listingIds.length
      ? supabase.from("listings").select("id, title").in("id", listingIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
  ]);
  return actions.map((a) => ({
    id: a.id,
    action: a.action,
    note: a.note,
    created_at: a.created_at,
    admin: a.admin_id ? { id: a.admin_id, full_name: people.get(a.admin_id) ?? "" } : null,
    listing: a.listing_id ? { id: a.listing_id, title: listings?.find((l) => l.id === a.listing_id)?.title ?? null } : null,
    user: a.user_id ? { id: a.user_id, full_name: people.get(a.user_id) ?? "" } : null,
  }));
}

export type ListingModeration = {
  status: ListingStatus;
  poster: AdminPoster | null;
  flags: AdminFlag[];
  openReports: AdminReport[];
  history: AdminLogEntry[];
};

/** What the admin panel on an ad page shows. */
export async function getListingModeration(listingId: string): Promise<ListingModeration | null> {
  const supabase = await createClient();
  const { data: listing } = await supabase.from("listings").select(LISTING_COLUMNS).eq("id", listingId).maybeSingle();
  if (!listing) return null;
  const [ad] = await enrich([listing]);
  const { data: actions } = await supabase
    .from("moderation_actions")
    .select("id, listing_id, admin_id, user_id, action, note, created_at")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false })
    .limit(10);
  const people = await names((actions ?? []).map((a) => a.admin_id));
  return {
    status: ad.status,
    poster: ad.poster,
    flags: ad.flags,
    openReports: ad.openReports,
    history: (actions ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      note: a.note,
      created_at: a.created_at,
      admin: a.admin_id ? { id: a.admin_id, full_name: people.get(a.admin_id) ?? "" } : null,
      listing: null,
      user: null,
    })),
  };
}

export const USERS_PAGE_SIZE = 50;

/** Members for the Users page, with emails (admin_list_users checks the caller). */
export async function listUsers(
  q: string | null,
  filter: UserFilter | null,
  page: number,
): Promise<{ users: AdminUserRow[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_q: q,
    p_filter: filter,
    p_limit: USERS_PAGE_SIZE,
    p_offset: (page - 1) * USERS_PAGE_SIZE,
  });
  if (error || !data) return { users: [], total: 0 };
  return { users: data, total: data[0]?.total_count ?? 0 };
}
