import { z } from "zod";
import { optionalText, requiredInt, requiredText } from "./common";

// F6 rental requests. The database functions repeat every check
// (send_request, shortlist_request, decline_request, withdraw_request).

export const HOUSEHOLD_TYPES = ["family", "bachelor_male", "bachelor_female"] as const;
export const DECLINE_REASONS = ["filled", "household", "move_in", "other"] as const;

/** Open requests a seeker may have at a time (plan section 1.4). */
export const OPEN_REQUEST_LIMIT = 10;
export const MESSAGE_MAX = 1000;
export const OCCUPATION_MAX = 80;
export const DECLINE_NOTE_MAX = 300;
/** How far ahead a move-in date may be. */
export const MOVE_IN_MAX_DAYS = 365;

/** Statuses that still count as open (one per ad, 10 in total). */
export const OPEN_STATUSES = ["pending", "shortlisted", "offered"] as const;

/** Today in Dhaka as YYYY-MM-DD (the database uses the same date). */
export function dhakaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(now);
}

/** YYYY-MM-DD plus a number of days. */
export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const sendRequestSchema = z
  .object({
    listingId: z.uuid("generic"),
    householdType: z.enum(HOUSEHOLD_TYPES, { error: "choiceRequired" }),
    membersCount: requiredInt(1, 20),
    occupation: requiredText(2, OCCUPATION_MAX),
    moveInDate: z.string().min(1, "required").regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid"),
    message: optionalText(MESSAGE_MAX),
  })
  .superRefine((v, ctx) => {
    const today = dhakaToday();
    if (v.moveInDate < today || v.moveInDate > addDays(today, MOVE_IN_MAX_DAYS)) {
      ctx.addIssue({ code: "custom", path: ["moveInDate"], message: "moveInInvalid" });
    }
  });

export type SendRequestInput = z.input<typeof sendRequestSchema>;

export const declineRequestSchema = z
  .object({
    requestId: z.uuid("generic"),
    reason: z.enum(DECLINE_REASONS, { error: "choiceRequired" }),
    note: optionalText(DECLINE_NOTE_MAX),
  })
  .superRefine((v, ctx) => {
    if (v.reason === "other" && !v.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "detailsRequired" });
    }
  });

export type DeclineRequestInput = z.input<typeof declineRequestSchema>;

export const requestIdSchema = z.uuid("generic");
