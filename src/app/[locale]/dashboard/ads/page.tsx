import type { Metadata } from "next";
import { Building2, ImageOff, Megaphone, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMyListings } from "@/lib/data/listings";
import { formatDate, formatTaka } from "@/lib/format";
import { MIN_PHOTOS, photoUrl } from "@/lib/photos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSuccessStatic } from "@/components/ui/success-note";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Ads");
  return { title: t("title"), robots: { index: false } };
}

export default async function MyAdsPage({ searchParams }: PageProps<"/[locale]/dashboard/ads">) {
  const query = await searchParams;
  const [t, tWizard, tEnum, locale, user] = await Promise.all([
    getTranslations("Ads"),
    getTranslations("Wizard"),
    getTranslations("Enums"),
    getLocale(),
    getCurrentUser(),
  ]);
  if (!user) return null;
  const ads = await getMyListings(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/post">
            <Plus aria-hidden />
            {t("postAd")}
          </Link>
        </Button>
      </div>

      {query.published === "1" && (
        <FormSuccessStatic title={tWizard("published")} body={tWizard("publishedBody")} />
      )}
      {query.saved === "1" && <FormSuccessStatic title={tWizard("draftSaved")} />}

      {ads.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <CardHeader className="w-full justify-items-center">
            <span className="mb-2 grid size-12 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <Megaphone className="size-6" aria-hidden />
            </span>
            <CardTitle>{t("empty")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/post">{t("postAd")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {ads.map((ad) => (
            <li key={ad.id}>
              <Card className="gap-3 py-5">
                <div className="flex gap-4 px-6">
                  <div className="hidden aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-md border bg-muted sm:block">
                    {ad.coverPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl(ad.coverPath)} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <span className="grid size-full place-items-center text-muted-foreground">
                        <ImageOff className="size-5" aria-hidden />
                      </span>
                    )}
                  </div>
                  <CardHeader className="flex-1 gap-2 px-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={ad.status === "active" ? "success" : ad.status === "draft" ? "warning" : "muted"}
                      >
                        {tEnum(`listingStatus.${ad.status}`)}
                      </Badge>
                      <Badge variant="outline">{tEnum(`listingType.${ad.listing_type}`)}</Badge>
                    </div>
                    <CardTitle className="text-base sm:text-lg">{ad.title ?? t("untitled")}</CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <Building2 className="size-3.5 shrink-0" aria-hidden />
                      {ad.buildingName} · {ad.unit?.label}
                    </CardDescription>
                    {ad.status === "draft" && ad.photoCount < MIN_PHOTOS && (
                      <p className="text-xs text-amber-800">{t("photosNeeded", { count: ad.photoCount, min: MIN_PHOTOS })}</p>
                    )}
                  </CardHeader>
                </div>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col text-sm">
                    {ad.monthly_rent !== null && (
                      <span className="font-semibold">
                        {tWizard("rentPerMonth", { amount: formatTaka(ad.monthly_rent, locale) })}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {ad.status === "active" && ad.expires_at
                        ? t("expires", { date: formatDate(ad.expires_at, locale) })
                        : t("updated", { date: formatDate(ad.updated_at, locale) })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {ad.status === "draft" && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/ads/${ad.id}`}>{t("preview")}</Link>
                      </Button>
                    )}
                    {ad.status === "draft" ? (
                      <Button asChild size="sm">
                        <Link href={`/post/${ad.id}`}>{t("continue")}</Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant={ad.status === "active" ? "default" : "outline"}>
                        <Link href={`/ads/${ad.id}`}>{t("view")}</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
