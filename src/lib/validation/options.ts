// Fixed choice lists shared by forms, search, admin tools and server actions.
// No zod in this file, so public pages (home, search, ad page) can use these
// lists without downloading the validation library (F12). The schemas in the
// other validation files import them from here.

export const LISTING_TYPES = ["flat", "room", "sublet", "mess_seat"] as const;
export const TENANT_TYPES = ["family", "bachelor_male", "bachelor_female", "student", "job_holder"] as const;
export const AMENITIES = ["lift", "parking", "generator", "security_guard", "cctv", "rooftop"] as const;

/** F5: reasons a member can give when reporting an ad. */
export const REPORT_REASONS = [
  "broker",
  "fake",
  "already_rented",
  "wrong_info",
  "discriminatory",
  "offensive",
  "other",
] as const;

/** Longest report details, admin note or ban reason (same as the database). */
export const NOTE_MAX = 500;

/** Admin decisions on one ad. auto_hide, ban and unban are not chosen here. */
export const ADMIN_LISTING_ACTIONS = ["approve", "reject", "hide", "restore"] as const;
export type AdminListingAction = (typeof ADMIN_LISTING_ACTIONS)[number];
