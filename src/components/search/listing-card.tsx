import { BedDouble, Bath, CalendarDays, Camera, ImageOff, MapPin, Ruler, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatDate, formatNumber, formatTaka } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import type { SearchResult } from "@/lib/search";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * One ad in search results, on the home page and on the map. Shows only
 * what a visitor may see. Works in server and client components.
 */
export function ListingCard({
  ad,
  areaLabel,
  compact = false,
  priority = false,
  className,
}: {
  ad: SearchResult;
  areaLabel: string;
  /** Smaller card with the photo on the left (map pop-up). */
  compact?: boolean;
  /** Load the photo straight away (first cards on the page). */
  priority?: boolean;
  className?: string;
}) {
  const t = useTranslations("Search");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const isMess = ad.listing_type === "mess_seat";
  const title = ad.title ?? t("untitled");

  const facts: { icon: typeof BedDouble; text: string }[] = [];
  if (isMess) facts.push({ icon: Users, text: t("seatsFree", { count: ad.open_slots }) });
  if (ad.bedrooms !== null && ad.unit_kind === "flat") facts.push({ icon: BedDouble, text: t("beds", { count: ad.bedrooms }) });
  if (ad.bathrooms !== null && ad.unit_kind === "flat") facts.push({ icon: Bath, text: t("baths", { count: ad.bathrooms }) });
  if (ad.size_sqft !== null && !compact) facts.push({ icon: Ruler, text: t("sqft", { size: ad.size_sqft }) });

  const available = ad.available_from
    ? ad.available_from <= today
      ? t("availableNow")
      : t("availableFrom", { date: formatDate(ad.available_from, locale) })
    : null;

  const photo = (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-muted",
        compact ? "aspect-square w-24 rounded-md sm:w-28" : "aspect-[4/3] w-full",
      )}
    >
      {ad.cover_path ? (
        // Served straight from Supabase Storage (already compressed).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl(ad.cover_path)}
          alt=""
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
        />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
          <ImageOff className="size-5" aria-hidden />
          {!compact && t("noPhoto")}
        </span>
      )}
      {!compact && (
        <span className="absolute top-2 left-2 flex flex-wrap gap-1">
          <Badge className="bg-background/95 text-foreground shadow-sm">{tEnum(`listingType.${ad.listing_type}`)}</Badge>
        </span>
      )}
      {!compact && ad.photo_count > 1 && (
        <span
          className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
          aria-label={t("photoCount", { count: ad.photo_count })}
        >
          <Camera className="size-3" aria-hidden />
          {formatNumber(ad.photo_count, locale)}
        </span>
      )}
    </div>
  );

  return (
    <article
      className={cn(
        "group relative flex overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow focus-within:ring-[3px] focus-within:ring-ring/50 hover:shadow-md",
        compact ? "flex-row gap-3 p-2.5" : "flex-col",
        className,
      )}
    >
      {photo}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5", compact ? "py-0.5 pr-1" : "p-4")}>
        {ad.monthly_rent !== null && (
          <p className="flex flex-wrap items-baseline gap-x-1">
            <span className={cn("font-bold text-primary", compact ? "text-base" : "text-lg")}>
              {formatTaka(ad.monthly_rent, locale)}
            </span>
            <span className="text-xs text-muted-foreground">{isMess ? t("perSeatMonth") : t("perMonth")}</span>
            {ad.rent_negotiable && !compact && (
              <span className="text-xs text-amber-800">· {t("negotiable")}</span>
            )}
          </p>
        )}
        <h3 className={cn("line-clamp-2 leading-snug font-semibold", compact ? "text-sm" : "text-base")}>
          {/* The link covers the whole card, so the card is one tap target. */}
          <Link
            href={`/ads/${ad.id}`}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            {title}
          </Link>
        </h3>
        <p className="flex items-start gap-1 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-1">{areaLabel}</span>
        </p>
        {facts.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {facts.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-1">
                <Icon className="size-3.5" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        )}
        {!compact && (
          <div className="mt-auto flex flex-col gap-2 pt-1">
            <ul className="flex flex-wrap gap-1.5" aria-label={t("openTo")}>
              {ad.tenant_types.slice(0, 3).map((type) => (
                <li key={type}>
                  <Badge variant="muted">{tEnum(`tenantType.${type as "family"}`)}</Badge>
                </li>
              ))}
              {ad.tenant_types.length > 3 && (
                <li>
                  <Badge variant="muted">+{formatNumber(ad.tenant_types.length - 3, locale)}</Badge>
                </li>
              )}
            </ul>
            {available && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" aria-hidden />
                {available}
              </p>
            )}
          </div>
        )}
        {compact && (
          <p className="text-xs text-muted-foreground">{tEnum(`listingType.${ad.listing_type}`)}</p>
        )}
      </div>
    </article>
  );
}
