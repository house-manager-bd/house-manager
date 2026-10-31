import { Handshake, Hourglass } from "lucide-react";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/format";
import type { ThreadInfoRow } from "@/types/database";
import { OfferTerms } from "./offer-terms";

/**
 * An open offer (F8), for both sides: its terms and until when it is valid.
 * The seeker's answer buttons, or the landlord side's note, come as children.
 */
export function OfferCard({
  info,
  hoursLeft,
  children,
}: {
  info: ThreadInfoRow;
  /** Whole hours until the offer expires, worked out when the page was made. */
  hoursLeft: number;
  children?: ReactNode;
}) {
  const t = useTranslations("Offer");
  const locale = useLocale();
  const asSeeker = info.my_side === "seeker";
  if (info.offer_rent === null || info.offer_start_date === null || !info.offer_expires_at) return null;

  return (
    <section
      id="offer"
      aria-labelledby="offer-title"
      className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-accent/60 bg-accent/5 p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="offer-title" className="flex items-center gap-2 font-semibold">
          <Handshake className="size-5 text-amber-700" aria-hidden />
          {asSeeker ? t("offerTitleSeeker") : t("offerTitleLandlord")}
        </h2>
        <p className="flex items-start gap-1.5 text-sm font-medium text-amber-800">
          <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {t("validUntil", { date: formatDateTime(info.offer_expires_at, locale) })}
            {hoursLeft > 0 && <span className="font-normal"> ({t("hoursLeft", { count: hoursLeft })})</span>}
          </span>
        </p>
      </div>
      <OfferTerms
        rent={info.offer_rent}
        advance={info.offer_advance ?? 0}
        startDate={info.offer_start_date}
        members={info.members_count}
        note={info.offer_note}
      />
      {children}
    </section>
  );
}
