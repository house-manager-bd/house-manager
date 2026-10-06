import { z } from "zod";
import {
  checkbox,
  optionalInt,
  optionalPhone,
  optionalText,
  requiredInt,
  requiredPhone,
  requiredText,
} from "./common";

export const LISTING_TYPES = ["flat", "room", "sublet", "mess_seat"] as const;
export const TENANT_TYPES = ["family", "bachelor_male", "bachelor_female", "student", "job_holder"] as const;
export const ELECTRICITY = ["prepaid", "postpaid", "included"] as const;
export const WATER = ["included", "tenant_pays"] as const;
export const GAS_BILL = ["included", "tenant_pays"] as const;

/** Advance above this many months shows the Rent Act warning (plan 1.8). */
export const ADVANCE_WARNING_MONTHS = 1;

/** Step 3: what kind of ad, and who is posting it. */
export const aboutStepSchema = z
  .object({
    postedAs: z.enum(["owner", "caretaker", "tenant_sublet"]),
    unitKind: z.enum(["flat", "room", "mess_room"]),
    listingType: z.enum(LISTING_TYPES, { error: "choiceRequired" }),
    title: requiredText(5, 100),
    description: optionalText(2000),
    availableFrom: z.string().min(1, "required").regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid"),
    ownerName: optionalText(80),
    subletConsent: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.postedAs === "caretaker" && !v.ownerName) {
      ctx.addIssue({ code: "custom", path: ["ownerName"], message: "required" });
    }
    if (v.postedAs === "tenant_sublet" && !v.subletConsent) {
      ctx.addIssue({ code: "custom", path: ["subletConsent"], message: "subletConsentRequired" });
    }
    if (v.listingType === "mess_seat" && v.unitKind !== "mess_room") {
      ctx.addIssue({ code: "custom", path: ["listingType"], message: "messSeatNeedsMessRoom" });
    }
    if (v.unitKind === "mess_room" && v.listingType !== "mess_seat") {
      ctx.addIssue({ code: "custom", path: ["listingType"], message: "messRoomNeedsMessSeat" });
    }
  });

/** Step 4: rent and costs. */
export const costsStepSchema = z.object({
  monthlyRent: requiredInt(500, 10_000_000),
  rentNegotiable: checkbox,
  advanceMonths: requiredInt(0, 12),
  serviceCharge: optionalInt(0, 1_000_000),
  electricity: z.enum(ELECTRICITY, { error: "choiceRequired" }),
  water: z.enum(WATER, { error: "choiceRequired" }),
  gasBill: z.preprocess((v) => (v === "" ? null : v), z.enum(GAS_BILL).nullable()),
  otherCharges: optionalText(300),
});

/** Step 5: who can rent, extra rules and contact. */
export const tenantsStepSchema = z
  .object({
    capacity: z.number().int(),
    listingType: z.enum(LISTING_TYPES),
    tenantTypes: z.array(z.enum(TENANT_TYPES)).min(1, "tenantTypesRequired"),
    maxOccupants: optionalInt(1, 30),
    openSlots: optionalInt(1, 30),
    extraRules: optionalText(1000),
    agreementRequired: checkbox,
    contactPhone: requiredPhone,
    whatsapp: optionalPhone,
  })
  .transform((v) => ({ ...v, openSlots: v.listingType === "mess_seat" ? (v.openSlots ?? 1) : 1 }))
  .superRefine((v, ctx) => {
    if (v.openSlots > v.capacity) {
      ctx.addIssue({ code: "custom", path: ["openSlots"], message: "slotsOverCapacity" });
    }
  });

export type AboutStepInput = z.input<typeof aboutStepSchema>;
export type CostsStepInput = z.input<typeof costsStepSchema>;
export type TenantsStepInput = z.input<typeof tenantsStepSchema>;

export const WIZARD_STEPS = [1, 2, 3, 4, 5, 6] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
