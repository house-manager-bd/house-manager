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

/** Pick the Bangla or English name of a location row. */
export function placeName(row: { name_en: string; name_bn: string } | null | undefined, locale: string) {
  if (!row) return "";
  return locale === "bn" ? row.name_bn : row.name_en;
}
