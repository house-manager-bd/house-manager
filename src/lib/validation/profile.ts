import { z } from "zod";
import { normalizeBdPhone } from "@/lib/phone";
import { fullNameSchema, localeSchema, modeSchema } from "./auth";

export const profileSchema = z.object({
  fullName: fullNameSchema,
  // Empty means "no phone". Anything else must be a valid BD mobile number.
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || normalizeBdPhone(v) !== null, "phoneInvalid"),
  locale: localeSchema,
  mode: modeSchema,
});

export type ProfileInput = z.infer<typeof profileSchema>;
