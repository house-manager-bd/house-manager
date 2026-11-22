import type { ListingStatus } from "@/types/database";

// F10: when an ad can be renewed, shared by the pages and the buttons. The
// database (listing_constants, renew_listing) has the same numbers and
// checks them again.

export const LIVE_DAYS = 30;
/** A live ad can be renewed in its last 7 days. */
export const RENEW_BEFORE_DAYS = 7;
/** An expired ad can be renewed up to 30 days after it expired. */
export const RENEW_AFTER_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

export type ManagedListing = {
  id: string;
  status: ListingStatus;
  paused_at: string | null;
  expires_at: string | null;
};

export type ManageState = {
  /** Whole days until a live ad expires (0 once it is due), or null. */
  daysLeft: number | null;
  /** Inside the renew window. */
  canRenew: boolean;
  /** Until when an expired ad can be renewed. */
  renewUntil: string | null;
  /** Live and running in its last 7 days (worth a warning). */
  expiringSoon: boolean;
};

export function manageState(l: ManagedListing, now = Date.now()): ManageState {
  const expires = l.expires_at ? new Date(l.expires_at).getTime() : null;
  if (l.status === "active" && expires !== null) {
    const left = expires - now;
    const soon = left <= RENEW_BEFORE_DAYS * DAY;
    return { daysLeft: Math.max(0, Math.ceil(left / DAY)), canRenew: soon, renewUntil: null, expiringSoon: soon };
  }
  if (l.status === "expired" && expires !== null) {
    const until = expires + RENEW_AFTER_DAYS * DAY;
    return {
      daysLeft: null,
      canRenew: now <= until,
      renewUntil: new Date(until).toISOString(),
      expiringSoon: false,
    };
  }
  return { daysLeft: null, canRenew: false, renewUntil: null, expiringSoon: false };
}
