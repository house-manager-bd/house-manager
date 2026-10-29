import { Building2, ImageOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AdminAd, AdminPoster, AdminReport } from "@/lib/data/admin";
import { formatDate, formatTaka } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { nameInitials } from "@/lib/utils";
import type { ListingStatus } from "@/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FlagList } from "./flag-list";
import { ModerationActions } from "./moderation-actions";

export function statusVariant(status: ListingStatus) {
  if (status === "active") return "success" as const;
  if (status === "pending_review" || status === "draft") return "warning" as const;
  return "muted" as const;
}

/** Name, photo, trust level and age of the account that posted an ad. */
export function PosterLine({ poster }: { poster: AdminPoster | null }) {
  const t = useTranslations("Admin");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  if (!poster) return null;
  const name = poster.full_name.trim() || t("noName");
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9 border">
        {poster.avatar_url && <AvatarImage src={poster.avatar_url} alt="" referrerPolicy="no-referrer" />}
        <AvatarFallback>{nameInitials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/admin/users?q=${encodeURIComponent(poster.full_name.trim())}`}
            className="truncate font-medium hover:underline"
            title={t("findMember")}
          >
            {name}
          </Link>
          <Badge variant={poster.trust_level === 0 ? "warning" : "default"}>
            {tEnum(`trustLevel.${poster.trust_level === 0 ? "0" : "1"}`)}
          </Badge>
          {poster.is_banned && <Badge className="bg-destructive/10 text-destructive">{t("badgeBanned")}</Badge>}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("memberSince", { date: formatDate(poster.created_at, locale) })}
        </span>
      </div>
    </div>
  );
}

/** Open reports on an ad: reason, details, who and when. */
export function ReportList({ reports }: { reports: AdminReport[] }) {
  const tEnum = useTranslations("Enums");
  const t = useTranslations("Admin");
  const locale = useLocale();
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {reports.map((r) => (
        <li key={r.id} className="flex flex-col gap-1 px-3 py-2.5 text-sm">
          <span className="font-medium">{tEnum(`reportReason.${r.reason}`)}</span>
          {r.details && <span className="break-words whitespace-pre-line">{r.details}</span>}
          <span className="text-xs text-muted-foreground">
            {t("reportedOn", {
              name: r.reporter?.full_name.trim() || t("noName"),
              date: formatDate(r.created_at, locale),
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One ad on the admin queue, hidden and reports pages: what it is, who
 * posted it, why it is here, and the decision buttons.
 */
export function AdReviewCard({ ad, areaName, viewerId }: { ad: AdminAd; areaName: string; viewerId: string }) {
  const t = useTranslations("Admin");
  const tEnum = useTranslations("Enums");
  const tSearch = useTranslations("Search");
  const locale = useLocale();
  const title = ad.title ?? t("untitled");
  const when = ad.submitted_at ?? ad.updated_at;

  return (
    <Card className="gap-4 py-5">
      <div className="flex gap-4 px-4 sm:px-6">
        <Link
          href={`/ads/${ad.id}`}
          className="block aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-md border bg-muted sm:w-36"
          tabIndex={-1}
          aria-hidden
        >
          {ad.coverPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl(ad.coverPath)} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <span className="grid size-full place-items-center text-muted-foreground">
              <ImageOff className="size-5" />
            </span>
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={statusVariant(ad.status)}>{tEnum(`listingStatus.${ad.status}`)}</Badge>
            <Badge variant="outline">{tEnum(`listingType.${ad.listing_type}`)}</Badge>
          </div>
          <Link href={`/ads/${ad.id}`} className="font-semibold break-words hover:underline sm:text-lg">
            {title}
          </Link>
          <p className="flex items-start gap-1 text-sm text-muted-foreground">
            <Building2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              {[areaName, ad.buildingName, ad.unitLabel].filter(Boolean).join(" · ")}
            </span>
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
            {ad.monthly_rent !== null && (
              <span className="font-semibold">
                {formatTaka(ad.monthly_rent, locale)}
                <span className="font-normal text-muted-foreground">
                  {ad.listing_type === "mess_seat" ? tSearch("perSeatMonth") : tSearch("perMonth")}
                </span>
              </span>
            )}
            <span className="text-muted-foreground">{t("photos", { count: ad.photoCount })}</span>
            <span className="text-muted-foreground">{t("sentIn", { date: formatDate(when, locale) })}</span>
          </p>
        </div>
      </div>

      <CardContent className="flex flex-col gap-4 px-4 sm:px-6">
        <PosterLine poster={ad.poster} />

        {ad.flags.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t("whyHere")}</h3>
            <FlagList flags={ad.flags} />
          </section>
        )}

        {ad.openReports.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t("reportsCount", { count: ad.openReports.length })}</h3>
            <ReportList reports={ad.openReports} />
          </section>
        )}

        {ad.lastAction && ad.status !== "pending_review" && (
          <p className="text-sm text-muted-foreground">
            {t("lastAction", {
              action: tEnum(`moderationAction.${ad.lastAction.action}`),
              who: ad.lastAction.admin?.full_name.trim() || t("system"),
              date: formatDate(ad.lastAction.created_at, locale),
            })}
            {ad.lastAction.note && <span className="block break-words text-foreground">{ad.lastAction.note}</span>}
          </p>
        )}

        <div className="border-t pt-4">
          <ModerationActions
            listingId={ad.id}
            status={ad.status}
            hasOpenReports={ad.openReports.length > 0}
            isOwn={ad.poster?.id === viewerId}
            posterBanned={Boolean(ad.poster?.is_banned)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
