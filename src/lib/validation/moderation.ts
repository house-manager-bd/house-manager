import { z } from "zod";
import { optionalText } from "./common";

// F5 moderation. The database functions repeat every check
// (report_listing, moderate_listing, set_user_ban).

import { ADMIN_LISTING_ACTIONS, NOTE_MAX, REPORT_REASONS, type AdminListingAction } from "./options";

export { ADMIN_LISTING_ACTIONS, NOTE_MAX, REPORT_REASONS, type AdminListingAction };

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
