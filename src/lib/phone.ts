const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Converts Bangla digits to ASCII digits, so "০১৭১২" becomes "01712". */
export function toAsciiDigits(value: string) {
  return value.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)));
}

/**
 * Normalizes a Bangladeshi mobile number to E.164 (+8801XXXXXXXXX).
 * Accepts 01XXXXXXXXX, 8801XXXXXXXXX and +8801XXXXXXXXX, with spaces or
 * dashes, in Bangla or English digits. Returns null when it is not valid.
 */
export function normalizeBdPhone(input: string): string | null {
  const digits = toAsciiDigits(input).replace(/[\s\-()]/g, "");
  const match = digits.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return match ? `+88${match[1]}` : null;
}

/** Shows +8801712345678 as 01712345678 in forms. */
export function formatBdPhoneLocal(e164: string | null | undefined) {
  if (!e164) return "";
  return e164.startsWith("+88") ? e164.slice(3) : e164;
}
