import { z } from "zod";
import { normalizeBdPhone, toAsciiDigits } from "@/lib/phone";

// Error messages are translation keys under "Errors" in messages/*.json.

/** Turns "", null and undefined into null, and "১২,০০০" into 12000. */
function toNumberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const text = toAsciiDigits(String(value)).replace(/[,\s]/g, "");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : Number.NaN;
}

const numberMessages = { error: "numberInvalid" } as const;

/** Optional whole number in a range. Empty input becomes null. */
export function optionalInt(min: number, max: number) {
  return z.preprocess(
    toNumberOrNull,
    z.number(numberMessages).int("numberInvalid").min(min, "numberRange").max(max, "numberRange").nullable(),
  );
}

/** Required whole number in a range. */
export function requiredInt(min: number, max: number) {
  return z.preprocess(
    toNumberOrNull,
    z
      .number({ error: (issue) => (issue.input === null ? "required" : "numberInvalid") })
      .int("numberInvalid")
      .min(min, "numberRange")
      .max(max, "numberRange"),
  );
}

/** Optional trimmed text. Empty input becomes null. */
export function optionalText(max: number) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max, "textTooLong").nullable().optional(),
  );
}

export function requiredText(min: number, max: number) {
  return z.string().trim().min(1, "required").min(min, "textTooShort").max(max, "textTooLong");
}

/** Bangladeshi mobile number, stored as +8801XXXXXXXXX. */
export const requiredPhone = z
  .string()
  .trim()
  .min(1, "required")
  .refine((v) => normalizeBdPhone(v) !== null, "phoneInvalid")
  .transform((v) => normalizeBdPhone(v)!);

export const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === "" || normalizeBdPhone(v) !== null, "phoneInvalid")
  .transform((v) => (v === "" ? null : normalizeBdPhone(v)));

/** Accepts true, "true" and "on" (checkboxes). */
export const checkbox = z.preprocess(
  (v) => v === true || v === "true" || v === "on",
  z.boolean(),
);
