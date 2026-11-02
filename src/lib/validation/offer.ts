import { z } from "zod";
import { toAsciiDigits } from "@/lib/phone";
import { optionalText, requiredInt, requiredText } from "./common";
import { addDays, dhakaToday, MOVE_IN_MAX_DAYS } from "./request";

// F8 offer and confirm. The database functions repeat every check
// (make_offer, accept_offer).

/** How long an offer stays open (plan section 1.4). */
export const OFFER_HOURS = 48;
export const OFFER_NOTE_MAX = 500;
export const RENT_MIN = 500;
export const RENT_MAX = 10_000_000;
/** The advance can be at most 12 months of the offered rent. */
export const ADVANCE_MAX_MONTHS = 12;
export const ADDRESS_MIN = 10;
export const ADDRESS_MAX = 300;

/** Private bucket for the tenant's photo (only the tenant and the landlord side read it). */
export const TENANT_DOCS_BUCKET = "tenant-docs";
/** The tenant's photo is shrunk to this longest side before upload. */
export const TENANT_PHOTO_MAX_SIDE = 800;
export const TENANT_PHOTO_QUALITY = 0.82;

/** Bangladesh NID numbers: 10 digits (smart card), 13 (old card) or 17 (old card with birth year). */
export const NID_PATTERN = /^(\d{10}|\d{13}|\d{17})$/;

/** Bangla digits to ASCII, without spaces or dashes: "১২৩ ৪৫৬-৭৮৯০" becomes "1234567890". */
export function normalizeNid(value: string) {
  return toAsciiDigits(value).replace(/[\s\-]/g, "");
}

export const makeOfferSchema = z
  .object({
    requestId: z.uuid("generic"),
    monthlyRent: requiredInt(RENT_MIN, RENT_MAX),
    advance: requiredInt(0, 120_000_000),
    startDate: z.string().min(1, "required").regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid"),
    note: optionalText(OFFER_NOTE_MAX),
  })
  .superRefine((v, ctx) => {
    if (v.advance > v.monthlyRent * ADVANCE_MAX_MONTHS) {
      ctx.addIssue({ code: "custom", path: ["advance"], message: "offerAdvanceInvalid" });
    }
    const today = dhakaToday();
    if (v.startDate < today || v.startDate > addDays(today, MOVE_IN_MAX_DAYS)) {
      ctx.addIssue({ code: "custom", path: ["startDate"], message: "moveInInvalid" });
    }
  });

export type MakeOfferInput = z.input<typeof makeOfferSchema>;

/** What the seeker fills in to accept an offer (the photo is checked separately). */
export const acceptDetailsSchema = z.object({
  nid: z.preprocess(
    (v) => (typeof v === "string" ? normalizeNid(v) : v),
    z.string().min(1, "required").regex(NID_PATTERN, "nidInvalid"),
  ),
  permanentAddress: requiredText(ADDRESS_MIN, ADDRESS_MAX),
  consent: z.literal(true, { error: "consentRequired" }),
});

export const acceptOfferSchema = acceptDetailsSchema.extend({
  requestId: z.uuid("generic"),
  /** <tenant id>/<request id>/<file> in the tenant-docs bucket, uploaded by the browser. */
  photoPath: z
    .string()
    .min(1, "photoMissing")
    .max(300, "photoMissing")
    .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/i, "photoMissing"),
});

/** The consent tick arrives as a plain boolean; the schema accepts only true. */
export type AcceptOfferInput = Omit<z.input<typeof acceptOfferSchema>, "consent"> & { consent: boolean };
