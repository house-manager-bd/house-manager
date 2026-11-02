import { BadgeCheck, House, IdCard, ImageOff, MapPin, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { TenantDetails } from "@/lib/data/offers";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ThreadInfoRow } from "@/types/database";
import { PhoneLinks } from "@/components/requests/phone-links";
import { NidReveal } from "./nid-reveal";
import { OfferTerms } from "./offer-terms";

/**
 * A confirmed request (F8): the tenancy's terms and address for both sides,
 * the landlord's number for the tenant, and the tenant's details for the
 * landlord side (for the DMP tenant form and the agreement).
 */
export function TenancyCard({ info, details }: { info: ThreadInfoRow; details: TenantDetails }) {
  const t = useTranslations("Offer");
  const locale = useLocale();
  const asSeeker = info.my_side === "seeker";
  const tenancy = details.tenancy;
  const v = details.verification;
  const start = tenancy?.start_date ?? info.offer_start_date;
  const address = [info.unit_label && t("unit", { label: info.unit_label }), info.house_no, info.road_address]
    .filter(Boolean)
    .join(", ");

  return (
    <section
      id="tenancy"
      aria-labelledby="tenancy-title"
      className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="tenancy-title" className="flex items-center gap-2 font-semibold">
          <BadgeCheck className="size-5 text-primary" aria-hidden />
          {asSeeker ? t("tenancyTitleSeeker") : t("tenancyTitleLandlord", { name: info.seeker_name || t("member") })}
        </h2>
        {info.confirmed_at && (
          <p className="text-xs text-muted-foreground">{t("confirmedOn", { date: formatDateTime(info.confirmed_at, locale) })}</p>
        )}
      </div>

      {tenancy ? (
        <OfferTerms
          rent={tenancy.monthly_rent}
          advance={tenancy.advance_amount}
          startDate={tenancy.start_date}
          members={tenancy.members_count}
        />
      ) : (
        info.offer_rent !== null &&
        info.offer_start_date && (
          <OfferTerms rent={info.offer_rent} advance={info.offer_advance ?? 0} startDate={info.offer_start_date} members={info.members_count} />
        )
      )}

      {address && (
        <p className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 break-words">
            <span className="block text-xs text-muted-foreground">{t("address")}</span>
            {address}
          </span>
        </p>
      )}

      {asSeeker && info.landlord_phone && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("landlordPhone")}</span>
          <PhoneLinks phone={info.landlord_phone} />
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border bg-background p-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <IdCard className="size-4 text-muted-foreground" aria-hidden />
          {asSeeker ? t("sharedTitleSeeker") : t("sharedTitleLandlord")}
        </h3>
        {v ? (
          <div className="flex flex-col gap-4 sm:flex-row">
            {details.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={details.photoUrl}
                alt={t("photoOf", { name: info.seeker_name || t("member") })}
                className="size-28 shrink-0 rounded-lg border object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="grid size-28 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground">
                <ImageOff className="size-6" aria-hidden />
              </span>
            )}
            <dl className="grid min-w-0 flex-1 gap-3 text-sm">
              {!asSeeker && (
                <div className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserRound className="size-3.5" aria-hidden />
                    {t("tenantName")}
                  </dt>
                  <dd className="font-medium break-words">{info.seeker_name || t("member")}</dd>
                </div>
              )}
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t("nid")}</dt>
                <dd>
                  <NidReveal requestId={info.id} last4={v.nid_last4} />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <House className="size-3.5" aria-hidden />
                  {t("permanentAddress")}
                </dt>
                <dd className="break-words whitespace-pre-line">{v.permanent_address}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t("consentGiven")}</dt>
                <dd>{formatDateTime(v.consent_at, locale)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("sharedMissing")}</p>
        )}
        <p className="text-xs text-muted-foreground">{asSeeker ? t("sharedNoteSeeker") : t("sharedNoteLandlord")}</p>
      </div>

      <p className="text-sm text-muted-foreground">
        {asSeeker ? t("nextSeeker", { date: start ? formatDate(start, locale) : "" }) : t("nextLandlord")}
      </p>
    </section>
  );
}
