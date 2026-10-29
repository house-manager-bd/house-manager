/** "৳ ২৫,০০০" on Bangla pages, "৳ 25,000" on English pages. */
export function formatTaka(amount: number, locale: string) {
  return `৳ ${new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(amount)}`;
}

export function formatNumber(n: number, locale: string) {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
}

/** 2026-11-01 as "১ নভেম্বর ২০২৬" or "1 November 2026". */
export function formatDate(isoDate: string, locale: string) {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * A moment (timestamptz) as Dhaka date and time: "30 Oct 2026, 2:15 pm", or
 * "৩০ অক্টো, ২০২৬, ২:১৫ দুপুর" (Bangla day periods, not AM and PM).
 */
export function formatDateTime(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(locale === "bn" ? { dayPeriod: "short" as const } : { hour12: true }),
    timeZone: "Asia/Dhaka",
  }).format(new Date(iso));
}

/** Pick the Bangla or English name of a location row. */
export function placeName(row: { name_en: string; name_bn: string } | null | undefined, locale: string) {
  if (!row) return "";
  return locale === "bn" ? row.name_bn : row.name_en;
}
