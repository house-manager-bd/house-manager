import type { Metadata } from "next";
import { Heart, HeartOff, Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLocationTree } from "@/lib/data/locations";
import { getSavedListings } from "@/lib/data/saved";
import { formatDate } from "@/lib/format";
import { areaLabels, type SearchResult } from "@/lib/search";
import type { SavedListingRow } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SaveButton } from "@/components/ads/save-button";
import { ListingCard } from "@/components/search/listing-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Saved");
  return { title: t("title"), robots: { index: false } };
}

/** A live or paused saved ad as a search card (the same columns as search_listings). */
function toCard(row: SavedListingRow): SearchResult {
  return {
    id: row.listing_id,
    title: row.title,
    listing_type: row.listing_type!,
    tenant_types: row.tenant_types ?? [],
    monthly_rent: row.monthly_rent,
    rent_negotiable: Boolean(row.rent_negotiable),
    open_slots: row.open_slots ?? 1,
    available_from: row.available_from,
    published_at: row.published_at,
    area_id: row.area_id!,
    landmark: row.landmark,
    approx_lat: Number(row.approx_lat),
    approx_lng: Number(row.approx_lng),
    gas: row.gas!,
    amenities: row.amenities ?? [],
    unit_kind: row.unit_kind!,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    size_sqft: row.size_sqft,
    furnishing: row.furnishing!,
    cover_path: row.cover_path,
    photo_count: row.photo_count ?? 0,
  };
}

/** F10 saved ads (FR30): the member's saved ads, newest saved first. */
export default async function SavedAdsPage({ params }: PageProps<"/[locale]/dashboard/saved">) {
  const { locale: routeLocale } = await params;
  const [t, tEnum, locale, user, tree, saved] = await Promise.all([
    getTranslations("Saved"),
    getTranslations("Enums"),
    getLocale(),
    getCurrentUser(),
    getLocationTree(),
    getSavedListings(),
  ]);
  if (!user) return null;
  const labels = areaLabels(tree, routeLocale as "bn" | "en");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        {saved.length > 0 && <p className="text-sm text-muted-foreground">{t("count", { count: saved.length })}</p>}
      </div>

      {saved.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <CardHeader className="w-full justify-items-center">
            <span className="mb-2 grid size-12 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <Heart className="size-6" aria-hidden />
            </span>
            <CardTitle className="text-base font-medium">{t("empty")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/ads">
                <Search aria-hidden />
                {t("searchCta")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {saved.map((row) => {
            const live = row.state === "active" || row.state === "paused";
            return (
              <li key={row.listing_id} className="relative flex flex-col gap-2">
                {live ? (
                  <>
                    <ListingCard ad={toCard(row)} areaLabel={labels[row.area_id!] ?? ""} className="w-full" />
                    <SaveButton
                      listingId={row.listing_id}
                      initialSaved
                      variant="overlay"
                      className="absolute top-2 right-2 z-10"
                    />
                    {row.state === "paused" && (
                      <Badge variant="warning" className="absolute top-3 left-3 z-10">
                        {t("statePaused")}
                      </Badge>
                    )}
                  </>
                ) : (
                  <Card className="h-full gap-3 py-5">
                    <CardHeader className="gap-2">
                      <div className="flex items-center gap-2">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                          <HeartOff className="size-4" aria-hidden />
                        </span>
                        <Badge variant="muted">{row.state === "rented" ? t("stateRented") : t("stateClosed")}</Badge>
                      </div>
                      <CardTitle className="text-base break-words">
                        {row.title?.trim() ||
                          (row.listing_type ? tEnum(`listingType.${row.listing_type}`) : t("closedTitle"))}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {row.state === "rented" ? t("rentedBody") : t("closedBody")}
                        {row.area_id !== null && labels[row.area_id] ? ` · ${labels[row.area_id]}` : ""}
                      </p>
                    </CardHeader>
                    <CardContent className="mt-auto flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {t("savedOn", { date: formatDate(row.saved_at, locale) })}
                      </span>
                      <SaveButton listingId={row.listing_id} initialSaved />
                    </CardContent>
                  </Card>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
