import { CalendarCheck, CalendarClock, CalendarDays, CircleAlert, ExternalLink, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatTime, formatVisitDay } from "@/lib/format";
import type { RequestViewings, RequestStatus } from "@/types/database";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CancelViewingButton } from "./cancel-viewing-button";
import { SlotPicker } from "./slot-picker";

/**
 * F11: visits on the request's page. The member books, moves or cancels a
 * visit; the landlord side sees the booking and links to the ad's times.
 * Renders nothing when there is nothing to show (a new request, a closed
 * one without a visit).
 */
export function ViewingCard({
  viewings: v,
  asSeeker,
  requestId,
  listingId,
  otherName,
  status,
}: {
  viewings: RequestViewings;
  asSeeker: boolean;
  requestId: string;
  listingId: string;
  otherName: string;
  /** The request's status as it is now (an offer past 48 hours is expired). */
  status: RequestStatus;
}) {
  const t = useTranslations("Viewing");
  const locale = useLocale();
  const open = status === "shortlisted" || status === "offered";
  const booking = v.booking;
  if (!booking && !open) return null;
  // A suspended member cannot book; the dashboard tells them why.
  if (asSeeker && !booking && !v.can_book && v.block !== "not_live") return null;

  const range = (time: { starts_at: string; ends_at: string }) =>
    t("timeRange", { from: formatTime(time.starts_at, locale), to: formatTime(time.ends_at, locale) });
  const manageHref = `/dashboard/ads/${listingId}/viewings`;
  const lastVisit = !booking && v.last_visit && (
    <p className="text-sm text-muted-foreground">
      {t("lastVisit", { day: formatVisitDay(v.last_visit.starts_at, locale), time: formatTime(v.last_visit.starts_at, locale) })}
    </p>
  );
  const notLive = v.block === "not_live" && (
    <p className="flex items-start gap-1.5 text-sm text-amber-800">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {booking ? t("notLiveWithVisit") : asSeeker ? t("notLiveSeeker") : t("notLiveLandlord")}
    </p>
  );

  return (
    <section
      id="visit"
      aria-labelledby="visit-title"
      className={cn(
        "flex scroll-mt-24 flex-col gap-4 rounded-lg border p-4",
        booking ? "border-primary/40 bg-primary/5" : "bg-card",
      )}
      data-testid="viewing-card"
    >
      <h2 id="visit-title" className="flex items-center gap-2 font-semibold">
        {booking ? (
          <CalendarCheck className="size-5 text-primary" aria-hidden />
        ) : (
          <CalendarDays className="size-5 text-primary" aria-hidden />
        )}
        {booking
          ? asSeeker
            ? t("yourVisit")
            : t("visitBooked")
          : asSeeker
            ? t("bookTitle")
            : t("visitTitle")}
      </h2>

      {booking && (
        <div className="flex flex-col gap-0.5">
          <p className="text-base font-semibold" data-testid="viewing-day">
            {formatVisitDay(booking.starts_at, locale)}
          </p>
          <p className="flex items-center gap-1.5 text-sm">
            <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {range(booking)}
          </p>
        </div>
      )}

      {booking && v.address && (
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("address")}</span>
            <span className="break-words">{[v.address.house_no, v.address.road_address].filter(Boolean).join(", ")}</span>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${v.address.exact_lat},${v.address.exact_lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1 text-primary hover:underline"
            >
              {t("openMap")}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </span>
        </div>
      )}

      {notLive}

      {asSeeker ? (
        <>
          {booking ? (
            <p className="text-sm text-muted-foreground">{t("visitSeekerHint", { name: otherName })}</p>
          ) : (
            v.can_book && <p className="text-sm text-muted-foreground">{t("bookBody")}</p>
          )}
          {lastVisit}
          {!booking && v.can_book && v.free_count === 0 && (
            <p className="text-sm" data-testid="viewing-none">
              {t("noTimes", { name: otherName })}
            </p>
          )}
          {!booking && v.can_book && v.free_count > 0 && <SlotPicker requestId={requestId} free={v.free} />}
          {booking && (
            <div className="flex flex-col gap-3">
              {v.can_book && v.free_count > 0 && (
                <details className="group rounded-lg border bg-background px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">{t("change")}</summary>
                  <div className="pt-3 pb-1">
                    <SlotPicker requestId={requestId} free={v.free} moving />
                  </div>
                </details>
              )}
              <CancelViewingButton requestId={requestId} />
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {booking ? t("visitLandlordHint", { name: otherName }) : t("notBookedYet", { name: otherName })}
          </p>
          {lastVisit}
          {!booking && open && v.block !== "not_live" && (
            <p className="text-sm" data-testid="viewing-free-count">
              {v.free_count > 0 ? t("freeTimes", { count: v.free_count }) : t("noFreeTimes", { name: otherName })}
            </p>
          )}
          <Button asChild size="sm" variant={booking || v.free_count > 0 ? "outline" : "default"} className="w-fit">
            <Link href={manageHref}>
              <CalendarDays aria-hidden />
              {booking || v.free_count > 0 ? t("manageTimes") : t("addTimes")}
            </Link>
          </Button>
        </>
      )}
    </section>
  );
}
