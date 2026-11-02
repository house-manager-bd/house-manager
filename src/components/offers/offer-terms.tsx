import { useLocale, useTranslations } from "next-intl";
import { formatDate, formatNumber, formatTaka } from "@/lib/format";

/** The terms of an offer or a tenancy: rent, advance, move-in date and people (F8). */
export function OfferTerms({
  rent,
  advance,
  startDate,
  members,
  note,
}: {
  rent: number;
  advance: number;
  startDate: string;
  members?: number | null;
  note?: string | null;
}) {
  const t = useTranslations("Offer");
  const locale = useLocale();
  const months = rent > 0 ? Math.round((advance / rent) * 10) / 10 : 0;

  const rows: [string, string][] = [
    [t("rent"), formatTaka(rent, locale)],
    [
      t("advance"),
      advance > 0
        ? `${formatTaka(advance, locale)} (${t("advanceMonths", { months })})`
        : t("noAdvance"),
    ],
    [t("startDate"), formatDate(startDate, locale)],
  ];
  if (members) rows.push([t("people"), formatNumber(members, locale)]);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="font-medium break-words">{value}</dd>
        </div>
      ))}
      {note && (
        <div className="col-span-full min-w-0">
          <dt className="text-xs text-muted-foreground">{t("noteFromLandlord")}</dt>
          <dd className="break-words whitespace-pre-line">{note}</dd>
        </div>
      )}
    </dl>
  );
}
