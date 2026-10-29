import type { Metadata } from "next";
import { ArrowRight, Building2, ImageOff, Inbox, Megaphone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { getInbox } from "@/lib/data/requests";
import { formatDateTime, formatTaka } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Inbox");
  return { title: t("title"), robots: { index: false } };
}

/** "Requests inbox": every ad the landlord manages that has requests (F6). */
export default async function InboxPage() {
  const [t, tEnum, locale, user, tree, inbox] = await Promise.all([
    getTranslations("Inbox"),
    getTranslations("Enums"),
    getLocale(),
    getCurrentUser(),
    getLocationTree(),
    getInbox(),
  ]);
  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="max-w-2xl text-muted-foreground">{t("subtitle")}</p>
      </div>

      {inbox.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <CardHeader className="w-full justify-items-center">
            <span className="mb-2 grid size-12 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <Inbox className="size-6" aria-hidden />
            </span>
            <CardTitle className="text-base font-medium">{t("empty")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/ads">
                <Megaphone aria-hidden />
                {t("myAds")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {inbox.map((row) => (
            <li key={row.listing_id}>
              <Card className="gap-3 py-5">
                <div className="flex gap-4 px-6">
                  <div className="hidden aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-md border bg-muted sm:block">
                    {row.cover_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl(row.cover_path)} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <span className="grid size-full place-items-center text-muted-foreground">
                        <ImageOff className="size-5" aria-hidden />
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.pending_count > 0 && <Badge variant="warning">{t("newCount", { count: row.pending_count })}</Badge>}
                      {row.shortlisted_count > 0 && <Badge>{t("shortlistedCount", { count: row.shortlisted_count })}</Badge>}
                      {row.closed_count > 0 && <Badge variant="muted">{t("closedCount", { count: row.closed_count })}</Badge>}
                      {row.listing_status !== "active" && (
                        <Badge variant="outline">{tEnum(`listingStatus.${row.listing_status}`)}</Badge>
                      )}
                    </div>
                    <h2 className="font-semibold break-words sm:text-lg">{row.listing_title ?? tEnum(`listingType.${row.listing_type}`)}</h2>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Building2 className="size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 break-words">
                        {row.building_name} · {row.unit_label} · {areaLabel(tree, row.area_id, locale)}
                      </span>
                    </p>
                  </div>
                </div>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col text-sm">
                    {row.monthly_rent !== null && <span className="font-semibold">{formatTaka(row.monthly_rent, locale)}</span>}
                    <span className="text-muted-foreground">
                      {t("lastRequest", { date: formatDateTime(row.last_request_at, locale) })}
                    </span>
                  </div>
                  <Button asChild size="sm" variant={row.pending_count > 0 ? "default" : "outline"}>
                    <Link
                      href={`/dashboard/ads/${row.listing_id}/requests${row.pending_count > 0 ? "" : row.shortlisted_count > 0 ? "?tab=shortlisted" : "?tab=closed"}`}
                    >
                      {t("openRequests")}
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
