import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CalendarPlus, CircleAlert, History } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getViewingsPage } from "@/lib/data/viewings";
import { dhakaDay, formatNumber, formatTime, formatVisitDay } from "@/lib/format";
import { nameInitials } from "@/lib/utils";
import { VIEWING_MAX_UPCOMING, viewingDays } from "@/lib/validation/viewing";
import type { ListingViewingSlotRow } from "@/types/database";
import { Alert } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveRefresh } from "@/components/messages/live-refresh";
import { AddSlotsForm } from "@/components/viewings/add-slots-form";
import { RemoveSlotButton } from "@/components/viewings/remove-slot-button";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Viewing");
  return { title: t("pageTitle"), robots: { index: false } };
}

/** Times grouped by their Dhaka day, in order. */
function byDay(slots: ListingViewingSlotRow[]) {
  const days = new Map<string, ListingViewingSlotRow[]>();
  for (const slot of slots) {
    const key = dhakaDay(slot.starts_at);
    days.set(key, [...(days.get(key) ?? []), slot]);
  }
  return [...days.entries()];
}

/** Splits the ad's times into those still to come (or going on now) and past visits. */
function splitByTime(slots: ListingViewingSlotRow[], now = Date.now()) {
  return {
    coming: slots.filter((s) => Date.parse(s.ends_at) > now),
    past: slots.filter((s) => Date.parse(s.ends_at) <= now && s.booked_request_id).reverse(),
    started: (s: ListingViewingSlotRow) => Date.parse(s.starts_at) <= now,
  };
}

/**
 * F11: one ad's visit times for its landlord side (the poster and the
 * building's managers): add times, see who booked which, remove a time.
 * Everybody else gets "page not found".
 */
export default async function ListingViewingsPage({ params }: PageProps<"/[locale]/dashboard/ads/[listingId]/viewings">) {
  const { listingId } = await params;
  if (!UUID.test(listingId)) notFound();

  const [t, tEnum, locale, user, page] = await Promise.all([
    getTranslations("Viewing"),
    getTranslations("Enums"),
    getLocale(),
    getCurrentUser(),
    getViewingsPage(listingId),
  ]);
  if (!user) return null;
  if (!page) notFound();

  const { listing, slots } = page;
  const live = listing.status === "active";
  const { coming, past, started } = splitByTime(slots);
  const upcoming = coming.filter((s) => !started(s)).length;
  const booked = coming.filter((s) => s.booked_request_id).length;
  const range = (s: { starts_at: string; ends_at: string }) =>
    t("timeRange", { from: formatTime(s.starts_at, locale), to: formatTime(s.ends_at, locale) });

  return (
    <div className="flex flex-col gap-6">
      {/* A booking, a move or a cancel by a member shows without reloading. */}
      <LiveRefresh messages={false} requests />
      <Link
        href={`/dashboard/ads/${listing.id}/requests`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("backToRequests")}
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("pageTitle")}</h1>
        <p className="font-medium break-words">
          <Link href={`/ads/${listing.id}`} className="hover:underline">
            {listing.title ?? tEnum(`listingType.${listing.listing_type}`)}
          </Link>
        </p>
        <p className="text-sm text-muted-foreground">{t("pageIntro")}</p>
        <p className="text-sm text-muted-foreground" data-testid="viewing-counts">
          {t("pageCounts", { upcoming, booked })} · {t("limitNote", { max: VIEWING_MAX_UPCOMING })}
        </p>
      </div>

      {!live && (
        <Alert>
          <CircleAlert aria-hidden />
          <span className="text-foreground">{t("pageNotLive", { status: tEnum(`listingStatus.${listing.status}`) })}</span>
        </Alert>
      )}

      {live && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="size-5 text-primary" aria-hidden />
              {t("addTitle")}
            </CardTitle>
            <CardDescription>{t("addBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AddSlotsForm listingId={listing.id} days={viewingDays()} />
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="coming-title" className="flex flex-col gap-3">
        <h2 id="coming-title" className="flex items-center gap-2 text-lg font-semibold">
          <CalendarDays className="size-5 text-primary" aria-hidden />
          {t("comingTitle")}
        </h2>
        {coming.length === 0 ? (
          <Card className="py-8 text-center">
            <CardContent>
              <p className="text-muted-foreground">{live ? t("emptyLive") : t("empty")}</p>
            </CardContent>
          </Card>
        ) : (
          byDay(coming).map(([key, daySlots]) => (
            <Card key={key} className="gap-0 py-0">
              <CardHeader className="border-b py-3">
                <CardTitle className="text-base">{formatVisitDay(daySlots[0].starts_at, locale)}</CardTitle>
                <CardDescription>
                  {t("dayCounts", {
                    count: daySlots.length,
                    booked: daySlots.filter((s) => s.booked_request_id).length,
                  })}
                </CardDescription>
              </CardHeader>
              <ul className="divide-y">
                {daySlots.map((slot) => {
                  const name = slot.member_name?.trim() || t("member");
                  return (
                    <li
                      key={slot.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      data-slot-row={slot.id}
                    >
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <span className="font-medium">{range(slot)}</span>
                        {slot.booked_request_id ? (
                          <Link
                            href={`/dashboard/requests/${slot.booked_request_id}`}
                            className="flex min-w-0 items-center gap-2 text-sm hover:underline"
                          >
                            <Avatar className="size-6 border">
                              {slot.member_avatar && <AvatarImage src={slot.member_avatar} alt="" referrerPolicy="no-referrer" />}
                              <AvatarFallback className="text-[10px]">{nameInitials(name)}</AvatarFallback>
                            </Avatar>
                            <span className="truncate">{t("bookedBy", { name })}</span>
                          </Link>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {started(slot) ? (
                          <Badge variant="warning">{t("now")}</Badge>
                        ) : slot.booked_request_id ? (
                          <Badge variant="success">{t("booked")}</Badge>
                        ) : (
                          <Badge variant="muted">{t("free")}</Badge>
                        )}
                        {!started(slot) && (
                          <RemoveSlotButton slotId={slot.id} bookedBy={slot.booked_request_id ? name : null} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))
        )}
      </section>

      {past.length > 0 && (
        <details className="group rounded-lg border bg-card px-4 py-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <History className="size-4 text-muted-foreground" aria-hidden />
            {t("pastTitle", { count: formatNumber(past.length, locale) })}
          </summary>
          <ul className="flex flex-col gap-2 pt-3">
            {past.map((slot) => (
              <li key={slot.id} className="text-sm">
                <Link href={`/dashboard/requests/${slot.booked_request_id}`} className="hover:underline">
                  {t("pastRow", {
                    day: formatVisitDay(slot.starts_at, locale),
                    time: formatTime(slot.starts_at, locale),
                    name: slot.member_name?.trim() || t("member"),
                  })}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
