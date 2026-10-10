import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Footprints,
  Lock,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { getAdPage, type AdPage } from "@/lib/data/ad";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { formatDate, formatNumber, formatTaka, placeName } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { ADVANCE_WARNING_MONTHS } from "@/lib/validation/listing";
import { EMPTY_FILTERS, searchHref } from "@/lib/validation/search";
import { AdMapLazy } from "@/components/ad/ad-map-lazy";
import { Gallery } from "@/components/ad/gallery";
import { RevealPhone } from "@/components/ad/reveal-phone";
import { ShareButton } from "@/components/ad/share-button";
import { Alert } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormSuccessStatic } from "@/components/ui/success-note";

type Lang = "bn" | "en";

export async function generateMetadata({ params }: PageProps<"/[locale]/ads/[listingId]">): Promise<Metadata> {
  const { locale, listingId } = await params;
  const lang = locale as Lang;
  const [t, tEnum, ad, tree] = await Promise.all([
    getTranslations({ locale: lang, namespace: "AdPage" }),
    getTranslations({ locale: lang, namespace: "Enums" }),
    getAdPage(listingId),
    getLocationTree(),
  ]);
  if (!ad) return { title: t("notFoundTitle"), robots: { index: false } };

  const { listing: l, building, photos } = ad;
  const title = l.title ?? t("untitled");
  const area = areaLabel(tree, building.area_id, lang);
  const summary = [
    l.monthly_rent !== null ? t("rentPerMonth", { amount: formatTaka(l.monthly_rent, lang) }) : null,
    tEnum(`listingType.${l.listing_type}`),
    area,
  ]
    .filter(Boolean)
    .join(" · ");
  const description = l.description ? `${summary}. ${l.description}`.slice(0, 200) : summary;
  const cover = photos[0];
  const path = `/${lang}/ads/${l.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: { bn: `/bn/ads/${l.id}`, en: `/en/ads/${l.id}` },
    },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      locale: lang === "bn" ? "bn_BD" : "en_US",
      images: cover
        ? [{ url: photoUrl(cover.storage_path), width: cover.width ?? undefined, height: cover.height ?? undefined, alt: title }]
        : undefined,
    },
    twitter: { card: cover ? "summary_large_image" : "summary" },
    // Drafts and paused ads are only seen by their poster; keep them out of search.
    robots: l.status === "active" ? undefined : { index: false, follow: false },
  };
}

export default async function AdPageRoute({ params, searchParams }: PageProps<"/[locale]/ads/[listingId]">) {
  const { listingId } = await params;
  const query = await searchParams;
  const [t, tEnum, locale, ad, tree] = await Promise.all([
    getTranslations("AdPage"),
    getTranslations("Enums"),
    getLocale(),
    getAdPage(listingId),
    getLocationTree(),
  ]);
  if (!ad) notFound();

  const { listing: l, unit, building, photos, nearby, address, ownContact, viewer } = ad;
  const title = l.title ?? t("untitled");
  const area = areaLabel(tree, building.area_id, locale);
  const ownView = Boolean(viewer?.isPoster || ownContact);
  const isMess = l.listing_type === "mess_seat";
  const rules = building.house_rules ?? {};
  const today = new Date().toISOString().slice(0, 10);

  const facts: [string, ReactNode][] = [];
  if (unit.bedrooms !== null) facts.push([t("bedrooms"), formatNumber(unit.bedrooms, locale)]);
  if (unit.bathrooms !== null) facts.push([t("bathrooms"), formatNumber(unit.bathrooms, locale)]);
  if (unit.balconies !== null) facts.push([t("balconies"), formatNumber(unit.balconies, locale)]);
  if (unit.size_sqft !== null) facts.push([t("size"), t("sqft", { size: unit.size_sqft })]);
  if (unit.floor_no !== null) {
    facts.push([
      t("floor"),
      unit.floor_no === 0
        ? t("groundFloor")
        : building.total_floors
          ? t("floorOf", { floor: unit.floor_no, total: building.total_floors })
          : t("floorNumber", { floor: unit.floor_no }),
    ]);
  }
  if (unit.facing) facts.push([t("facing"), tEnum(`facing.${unit.facing as "north"}`)]);
  facts.push([t("furnishing"), tEnum(`furnishing.${unit.furnishing}`)]);
  if (isMess) facts.push([t("seatsOffered"), t("seatsOf", { count: l.open_slots, capacity: unit.capacity })]);
  else if (l.max_occupants !== null) facts.push([t("maxOccupants"), formatNumber(l.max_occupants, locale)]);

  const costs: [string, ReactNode][] = [];
  if (l.monthly_rent !== null) {
    costs.push([t("monthlyRent"), `${formatTaka(l.monthly_rent, locale)}${l.rent_negotiable ? ` (${t("negotiable")})` : ""}`]);
  }
  if (l.advance_months !== null) {
    costs.push([
      t("advance"),
      <span key="advance" className="flex flex-col gap-1">
        <span>
          {l.advance_months === 0
            ? t("noAdvance")
            : l.monthly_rent !== null
              ? t("advanceWithAmount", {
                  count: l.advance_months,
                  amount: formatTaka(l.monthly_rent * l.advance_months, locale),
                })
              : t("advanceMonths", { count: l.advance_months })}
        </span>
        {l.advance_months > ADVANCE_WARNING_MONTHS && (
          <span className="text-xs text-amber-800">{t("advanceLawNote")}</span>
        )}
      </span>,
    ]);
  }
  costs.push([t("serviceCharge"), l.service_charge ? formatTaka(l.service_charge, locale) : t("none")]);
  if (l.electricity) costs.push([t("electricity"), tEnum(`electricity.${l.electricity}`)]);
  if (l.water) costs.push([t("water"), tEnum(`water.${l.water}`)]);
  if (building.gas !== "none") {
    costs.push([
      t("gas"),
      l.gas_bill ? `${tEnum(`gas.${building.gas}`)} · ${tEnum(`gasBill.${l.gas_bill}`)}` : tEnum(`gas.${building.gas}`),
    ]);
  }
  if (l.other_charges) costs.push([t("otherCharges"), l.other_charges]);

  const yesNo = (v: boolean) => (v ? t("allowed") : t("notAllowed"));
  const ruleRows: [string, ReactNode][] = [];
  if (rules.pets !== undefined) ruleRows.push([t("rulePets"), yesNo(rules.pets)]);
  if (rules.smoking !== undefined) ruleRows.push([t("ruleSmoking"), yesNo(rules.smoking)]);
  if (rules.guests_overnight !== undefined) ruleRows.push([t("ruleGuests"), yesNo(rules.guests_overnight)]);
  if (rules.rooftop_use !== undefined) ruleRows.push([t("ruleRooftop"), yesNo(rules.rooftop_use)]);
  if (rules.gate_closing_time) ruleRows.push([t("ruleGate"), rules.gate_closing_time]);
  if (rules.notes) ruleRows.push([t("ruleNotes"), rules.notes]);
  if (l.extra_rules) ruleRows.push([t("unitRules"), l.extra_rules]);

  const nextPath = `/${locale}/ads/${l.id}`;
  const mapLat = address?.exact_lat ?? building.approx_lat;
  const mapLng = address?.exact_lng ?? building.approx_lng;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-6 sm:pt-8 lg:pb-8">
      <nav aria-label={t("breadcrumb")} className="-mb-2 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/ads" className="hover:text-foreground hover:underline">
              {t("allAds")}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li>
            <Link
              href={searchHref(EMPTY_FILTERS, { place: { kind: "area", id: building.area_id } })}
              className="hover:text-foreground hover:underline"
            >
              {t("moreInArea", { area: placeName(tree.areas.find((a) => a.id === building.area_id), locale) })}
            </Link>
          </li>
        </ol>
      </nav>
      {query.published === "1" && viewer?.isPoster && (
        <FormSuccessStatic title={t("publishedTitle")} body={t("publishedBody")} />
      )}
      {l.status !== "active" && (
        <Alert>
          <CircleAlert aria-hidden />
          <span className="flex flex-col gap-1">
            <span className="font-medium text-foreground">
              {t("notPublic", { status: tEnum(`listingStatus.${l.status}`) })}
            </span>
            {l.status === "draft" && viewer?.isPoster && (
              <Link href={`/post/${l.id}`} className="w-fit text-primary underline underline-offset-2">
                {t("continueEditing")}
              </Link>
            )}
          </span>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <Gallery
            title={title}
            photos={photos.map((p) => ({ url: photoUrl(p.storage_path), width: p.width, height: p.height }))}
          />

          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{tEnum(`listingType.${l.listing_type}`)}</Badge>
              {l.rent_negotiable && <Badge variant="warning">{t("negotiable")}</Badge>}
            </div>
            <h1 className="text-2xl leading-snug font-bold sm:text-3xl">{title}</h1>
            <p className="flex items-start gap-1.5 text-muted-foreground">
              <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
              <span>
                {area}
                {building.landmark && <> · {building.landmark}</>}
              </span>
            </p>
            {l.monthly_rent !== null && (
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-3xl font-bold text-primary">{formatTaka(l.monthly_rent, locale)}</span>
                <span className="text-muted-foreground">{isMess ? t("perSeatMonth") : t("perMonth")}</span>
              </p>
            )}
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {l.available_from && (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-4" aria-hidden />
                  {l.available_from <= today
                    ? t("availableNow")
                    : t("availableFrom", { date: formatDate(l.available_from, locale) })}
                </span>
              )}
              {l.published_at && <span>{t("postedOn", { date: formatDate(l.published_at, locale) })}</span>}
            </p>
          </header>

          {facts.length > 0 && (
            <Section title={t("sectionHome")}>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {facts.map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-card px-3 py-2.5">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {l.description && (
            <Section title={t("sectionDescription")}>
              <p className="break-words whitespace-pre-line">{l.description}</p>
            </Section>
          )}

          <Section title={t("sectionCosts")}>
            <Rows rows={costs} />
          </Section>

          <Section title={t("sectionTenants")}>
            <div className="flex flex-wrap gap-2">
              {l.tenant_types.map((type) => (
                <Badge key={type} variant="outline" className="px-3 py-1 text-sm">
                  {tEnum(`tenantType.${type as "family"}`)}
                </Badge>
              ))}
            </div>
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {l.agreement_required && <li>{t("agreementRequired")}</li>}
              {l.dmp_form_required && <li>{t("dmpRequired")}</li>}
            </ul>
          </Section>

          <Section title={t("sectionBuilding")}>
            <div className="flex flex-wrap gap-2">
              {building.total_floors && (
                <Badge variant="muted" className="px-3 py-1 text-sm">
                  {t("floorsCount", { count: building.total_floors })}
                </Badge>
              )}
              <Badge variant="muted" className="px-3 py-1 text-sm">
                {tEnum(`gas.${building.gas}`)}
              </Badge>
              {building.amenities.map((a) => (
                <Badge key={a} variant="muted" className="px-3 py-1 text-sm">
                  {tEnum(`amenity.${a as "lift"}`)}
                </Badge>
              ))}
            </div>
            {ruleRows.length > 0 && (
              <>
                <h3 className="mt-2 font-semibold">{t("houseRules")}</h3>
                <Rows rows={ruleRows} />
              </>
            )}
          </Section>

          {nearby.length > 0 && (
            <Section title={t("sectionNearby")}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {nearby.map((place) => (
                  <li key={`${place.kind}-${place.name}`} className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
                    <Footprints className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span className="flex flex-col">
                      <span className="font-medium">{place.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {tEnum(`nearbyKind.${place.kind}`)}
                        {place.walk_minutes !== null && <> · {t("walkMinutes", { count: place.walk_minutes })}</>}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={t("sectionLocation")}>
            {address ? (
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {[building.name, address.house_no && t("houseNo", { no: address.house_no }), address.road_address]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p className="text-sm text-muted-foreground">{area}</p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${address.exact_lat},${address.exact_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-fit items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  {t("openInMaps")}
                </a>
              </div>
            ) : (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                {viewer ? t("addressHidden") : t("approxNote")}
              </p>
            )}
            <AdMapLazy
              lat={mapLat}
              lng={mapLng}
              exact={address !== null}
              label={address ? t("mapExact") : t("mapApprox")}
            />
          </Section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <Card id="contact" className="scroll-mt-20 gap-4 py-5">
            <CardContent className="flex flex-col gap-4">
              <PosterBlock ad={ad} t={t} tEnum={tEnum} locale={locale} />

              {ownView ? (
                <>
                  <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">{t("yourAd")}</p>
                  <RevealPhone
                    listingId={l.id}
                    initial={{ phone: ownContact?.contact_phone ?? null, whatsapp: ownContact?.whatsapp ?? null }}
                  />
                </>
              ) : viewer ? (
                l.status === "active" && <RevealPhone listingId={l.id} initial={null} />
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {t("loginToContact")}
                  </p>
                  <Button asChild size="lg" className="w-full">
                    <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>{t("loginButton")}</Link>
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    {t("noAccount")}{" "}
                    <Link href="/signup" className="text-primary underline-offset-2 hover:underline">
                      {t("signupLink")}
                    </Link>
                  </p>
                </div>
              )}

              <div className="flex justify-end border-t pt-4">
                <ShareButton title={title} />
              </div>
            </CardContent>
          </Card>

          <Alert>
            <ShieldCheck aria-hidden />
            <span className="flex flex-col gap-1">
              <span className="font-medium text-foreground">{t("safetyTitle")}</span>
              <span className="text-muted-foreground">{t("safetyBody")}</span>
            </span>
          </Alert>
        </aside>
      </div>

      {/* Phones: the contact card is far down, so a bar keeps it one tap away.
          Sticky (not fixed), so it stops above the footer. */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          {l.monthly_rent !== null ? (
            <p className="flex flex-col leading-tight">
              <span className="text-lg font-bold text-primary">{formatTaka(l.monthly_rent, locale)}</span>
              <span className="text-xs text-muted-foreground">{isMess ? t("perSeatMonth") : t("perMonth")}</span>
            </p>
          ) : (
            <span />
          )}
          <Button asChild>
            <a href="#contact">{viewer ? t("contactButton") : t("loginButton")}</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t pt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y rounded-lg border">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words whitespace-pre-line">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "Abdul Karim" becomes "AK". (The header's helper lives in a client file.) */
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.trim().slice(0, 2);
  return letters.toUpperCase();
}

function PosterBlock({
  ad,
  t,
  tEnum,
  locale,
}: {
  ad: AdPage;
  t: Awaited<ReturnType<typeof getTranslations<"AdPage">>>;
  tEnum: Awaited<ReturnType<typeof getTranslations<"Enums">>>;
  locale: string;
}) {
  const { listing: l, poster } = ad;
  const name = poster?.full_name || t("member");
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-12 border">
        {poster?.avatar_url && <AvatarImage src={poster.avatar_url} alt="" referrerPolicy="no-referrer" />}
        <AvatarFallback>{initialsOf(name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{name}</span>
        <span className="text-sm text-muted-foreground">{tEnum(`postedAs.${l.posted_as}`)}</span>
        {l.posted_as === "caretaker" && l.owner_name && (
          <span className="text-sm text-muted-foreground">{t("ownerIs", { name: l.owner_name })}</span>
        )}
        {poster && (
          <span className="text-xs text-muted-foreground">
            {t("memberSince", { date: formatDate(poster.created_at, locale) })}
          </span>
        )}
      </div>
    </div>
  );
}
