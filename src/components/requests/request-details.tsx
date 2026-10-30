import { useLocale, useTranslations } from "next-intl";
import { formatDate, formatNumber } from "@/lib/format";
import type { RentalRequestRow } from "@/types/database";

type Details = Pick<RentalRequestRow, "household_type" | "members_count" | "occupation" | "move_in_date" | "message">;

/** What a seeker wrote in a request. Shown to the seeker and to the landlord (F6). */
export function RequestDetails({ request }: { request: Details }) {
  const t = useTranslations("Requests");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();

  const rows: [string, string][] = [
    [t("household"), tEnum(`householdType.${request.household_type}`)],
    [t("members"), formatNumber(request.members_count, locale)],
    [t("occupation"), request.occupation],
    [t("moveIn"), formatDate(request.move_in_date, locale)],
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="font-medium break-words">{value}</dd>
        </div>
      ))}
      {request.message && (
        <div className="col-span-full min-w-0">
          <dt className="text-xs text-muted-foreground">{t("message")}</dt>
          <dd className="break-words whitespace-pre-line">{request.message}</dd>
        </div>
      )}
    </dl>
  );
}
