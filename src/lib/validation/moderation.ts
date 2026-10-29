import { z } from "zod";
import { optionalText } from "./common";

// F5 moderation. The database functions repeat every check
// (report_listing, moderate_listing, set_user_ban).

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

export const reportSchema = z
  .object({
    listingId: z.uuid("generic"),
    reason: z.enum(REPORT_REASONS, { error: "choiceRequired" }),
    details: optionalText(NOTE_MAX),
  })
  .superRefine((v, ctx) => {
    if (v.reason === "other" && !v.details) {
      ctx.addIssue({ code: "custom", path: ["details"], message: "detailsRequired" });
    }
  });

export type ReportInput = z.input<typeof reportSchema>;

/** Admin decisions on one ad. auto_hide, ban and unban are not chosen here. */
export const ADMIN_LISTING_ACTIONS = ["approve", "reject", "hide", "restore"] as const;
export type AdminListingAction = (typeof ADMIN_LISTING_ACTIONS)[number];

export const moderateSchema = z
  .object({
    listingId: z.uuid("generic"),
    action: z.enum(ADMIN_LISTING_ACTIONS, { error: "generic" }),
    note: optionalText(NOTE_MAX),
  })
  .superRefine((v, ctx) => {
    if (v.action === "reject" && !v.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "reasonRequired" });
    }
  });

export type ModerateInput = z.input<typeof moderateSchema>;

export const banSchema = z
  .object({
    userId: z.uuid("generic"),
    banned: z.boolean(),
    note: optionalText(NOTE_MAX),
  })
  .superRefine((v, ctx) => {
    if (v.banned && !v.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "reasonRequired" });
    }
  });

export type BanInput = z.input<typeof banSchema>;

/** Filters on the admin Users page (?filter=). */
export const USER_FILTERS = ["new", "banned", "admins"] as const;
export type UserFilter = (typeof USER_FILTERS)[number];
