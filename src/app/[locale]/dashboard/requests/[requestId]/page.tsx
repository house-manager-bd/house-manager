import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, Building2, ExternalLink, Handshake, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { getThread } from "@/lib/data/messages";
import { getRequestNewestUnread } from "@/lib/data/notifications";
import { getTenantDetails } from "@/lib/data/offers";
import { formatDate, formatTaka } from "@/lib/format";
import { dhakaToday, OPEN_STATUSES } from "@/lib/validation/request";
import type { ThreadInfoRow } from "@/types/database";
import { cn, nameInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormSuccessStatic } from "@/components/ui/success-note";
import { LiveRefresh } from "@/components/messages/live-refresh";
import { MarkRequestNotificationsRead } from "@/components/notifications/mark-request-read";
import { Thread, type ThreadEvent } from "@/components/messages/thread";
import { AcceptForm } from "@/components/offers/accept-form";
import { OfferCard } from "@/components/offers/offer-card";
import { OfferForm } from "@/components/offers/offer-form";
import { TenancyCard } from "@/components/offers/tenancy-card";
import { PhoneLinks } from "@/components/requests/phone-links";
import { RequestActions } from "@/components/requests/request-actions";
import { RequestDetails } from "@/components/requests/request-details";
import { WithdrawButton } from "@/components/requests/withdraw-button";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Thread");
  return { title: t("title"), robots: { index: false } };
}

/** The request's steps, shown in the thread at the time they happened. */
function threadEvents(info: ThreadInfoRow): ThreadEvent[] {
  const events: ThreadEvent[] = [{ kind: "sent", at: info.created_at }];
  if (info.shortlisted_at) events.push({ kind: "shortlisted", at: info.shortlisted_at });
  // F8: an offer can only end in confirmed, declined, withdrawn or expired.
  if (info.offered_at) events.push({ kind: "offered", at: info.offered_at });
  if (info.confirmed_at) events.push({ kind: "confirmed", at: info.confirmed_at });
  if (info.closed_at) {
    if (info.status === "declined") {
      events.push({ kind: "declined", at: info.closed_at, reason: info.decline_reason, note: info.decline_note });
    } else if (info.status === "withdrawn") {
      events.push({ kind: info.offered_at ? "offerTurnedDown" : "withdrawn", at: info.closed_at });
    } else if (info.status === "expired") {
      events.push({ kind: info.offered_at ? "offerExpired" : "expired", at: info.closed_at });
    }
  }
  return events;
}

/** Whole hours until a moment, at least 0. Worked out once per page render. */
function hoursUntil(iso: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 3_600_000));
}

/** Why the landlord side cannot make an offer on a shortlisted request right now, or null. */
function offerBlock(info: ThreadInfoRow): "offerNotLive" | "offerSeekerBanned" | "notEnoughSeats" | "offerLimit" | null {
  if (info.listing_status !== "active") return "offerNotLive";
  if (info.seeker_banned) return "offerSeekerBanned";
  if (info.seats_needed > info.open_slots) return "notEnoughSeats";
  if ((info.seats_offered ?? 0) + info.seats_needed > info.open_slots) return "offerLimit";
  return null;
}

/**
 * One request and its message thread (F7), for both sides: the seeker, and
 * the ad's poster and building managers. Everybody else gets "page not
 * found", admins included.
 */
export default async function RequestThreadPage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/requests/[requestId]">) {
  const { requestId } = await params;
  const query = await searchParams;
  if (!UUID.test(requestId)) notFound();

  const [t, tEnum, tInbox, tOffer, locale, user, tree, thread, newestUnread] = await Promise.all([
    getTranslations("Thread"),
    getTranslations("Enums"),
    getTranslations("Inbox"),
    getTranslations("Offer"),
    getLocale(),
    getCurrentUser(),
    getLocationTree(),
    getThread(requestId),
    getRequestNewestUnread(requestId),
  ]);
  if (!user) return null;
  if (!thread) notFound();

  const { info } = thread;
  const asSeeker = info.my_side === "seeker";
  const live = info.listing_status === "active";
  const open = (OPEN_STATUSES as readonly string[]).includes(info.status);
  const offered = info.status === "offered";
  const confirmed = info.status === "confirmed";
  // F8: the tenancy and what the tenant shared, only once confirmed.
  const details = confirmed ? await getTenantDetails(info.id) : null;
  const otherName = (asSeeker ? info.poster_name : info.seeker_name)?.trim() || (asSeeker ? t("landlord") : t("member"));
  const otherAvatar = asSeeker ? info.poster_avatar : info.seeker_avatar;
  const adTitle = info.listing_title ?? tEnum(`listingType.${info.listing_type}`);
  const selfPath = `/dashboard/requests/${info.id}`;
  const adRequestsPath = `/dashboard/ads/${info.listing_id}/requests`;
  const backHref = asSeeker
    ? `/dashboard/requests${open ? "" : confirmed ? "?tab=confirmed" : "?tab=closed"}`
    : `${adRequestsPath}${info.status === "pending" ? "" : open ? "?tab=shortlisted" : confirmed ? "?tab=confirmed" : "?tab=closed"}`;
  const mess = info.listing_type === "mess_seat";
  const offerRent = info.monthly_rent !== null ? info.monthly_rent * (mess ? info.seats_needed : 1) : null;
  const today = dhakaToday();
  const block = !asSeeker && info.status === "shortlisted" ? offerBlock(info) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* An offer, an answer or a decline from the other side shows without reloading (F8). */}
      <LiveRefresh messages={false} requestId={info.id} />
      {/* F9: this request's notifications are read now. */}
      {newestUnread && <MarkRequestNotificationsRead requestId={info.id} newest={newestUnread} />}
      <Link
        href={backHref}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {asSeeker ? t("backSeeker") : t("backLandlord")}
      </Link>

      <Card className="gap-4 py-4">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Avatar className="size-12 border">
              {otherAvatar && <AvatarImage src={otherAvatar} alt="" referrerPolicy="no-referrer" />}
              <AvatarFallback>{nameInitials(otherName)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold break-words sm:text-xl">{otherName}</h1>
                <Badge
                  variant={
                    info.status === "shortlisted" || confirmed ? "success" : info.status === "pending" || offered ? "warning" : "muted"
                  }
                  className={info.status === "declined" ? "bg-destructive/10 text-destructive" : undefined}
                >
                  {info.status === "shortlisted" && <Star className="size-3" aria-hidden />}
                  {offered && <Handshake className="size-3" aria-hidden />}
                  {confirmed && <BadgeCheck className="size-3" aria-hidden />}
                  {asSeeker ? tEnum(`requestStatus.${info.status}`) : tInbox(`status.${info.status}`)}
                </Badge>
                {!asSeeker && info.seeker_banned && (
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    {tInbox("suspended")}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {asSeeker
                  ? tEnum(`postedAs.${info.posted_as}`)
                  : tInbox("memberSince", { date: formatDate(info.seeker_since, locale) })}
              </p>
              <p className="flex items-start gap-1.5 text-sm">
                <Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-words">
                  {live ? (
                    <Link href={`/ads/${info.listing_id}`} className="font-medium hover:underline">
                      {adTitle}
                    </Link>
                  ) : (
                    <span className="font-medium">{adTitle}</span>
                  )}
                  <span className="text-muted-foreground">
                    {" "}
                    · {areaLabel(tree, info.area_id, locale)}
                    {info.monthly_rent !== null && <> · {formatTaka(info.monthly_rent, locale)}</>}
                    {!live && <> · {tEnum(`listingStatus.${info.listing_status}`)}</>}
                  </span>
                </span>
              </p>
            </div>
          </div>

          {query.done === "shortlisted" && <FormSuccessStatic title={tInbox("doneShortlisted")} />}
          {query.done === "declined" && <FormSuccessStatic title={tInbox("doneDeclined")} />}
          {query.done === "offered" && offered && <FormSuccessStatic title={tOffer("doneOffered")} body={tOffer("doneOfferedBody")} />}
          {query.done === "accepted" && confirmed && <FormSuccessStatic title={tOffer("doneAccepted")} body={tOffer("doneAcceptedBody")} />}

          {!asSeeker && info.seeker_phone && (
            <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <span className="text-xs font-medium text-muted-foreground">{tInbox("phone")}</span>
              <PhoneLinks phone={info.seeker_phone} />
            </div>
          )}

          <details className="group rounded-lg border bg-muted/30 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              {asSeeker ? t("detailsSeeker") : t("detailsLandlord")}
            </summary>
            <div className="pt-3 pb-1">
              {/* The message from the form is the first message in the thread below. */}
              <RequestDetails request={{ ...info, message: null }} />
            </div>
          </details>

          {asSeeker ? (
            (open || live) &&
            !offered && (
              <div className={cn("flex flex-wrap items-start gap-2")}>
                {live && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/ads/${info.listing_id}`}>
                      <ExternalLink aria-hidden />
                      {t("openAd")}
                    </Link>
                  </Button>
                )}
                {open && <WithdrawButton requestId={info.id} />}
              </div>
            )
          ) : (
            !offered && (
              <div className="flex flex-col gap-3">
                {info.status === "shortlisted" &&
                  (block ? (
                    <p className="text-sm text-muted-foreground">
                      {tOffer(block, { count: info.open_slots, seats: info.seats_needed })}
                    </p>
                  ) : (
                    <OfferForm
                      requestId={info.id}
                      memberName={otherName}
                      defaultRent={offerRent}
                      defaultAdvance={offerRent !== null ? offerRent * (info.advance_months ?? 1) : null}
                      defaultStartDate={info.move_in_date > today ? info.move_in_date : today}
                      seats={mess ? info.seats_needed : null}
                      returnTo={selfPath}
                      defaultOpen={query.offer === "open"}
                    />
                  ))}
                {info.status === "pending" && live && <p className="text-xs text-muted-foreground">{tOffer("shortlistFirst")}</p>}
                <RequestActions
                  requestId={info.id}
                  status={info.status}
                  canShortlist={live && !info.seeker_banned}
                  basePath={adRequestsPath}
                  tab={info.status === "pending" ? "new" : "shortlisted"}
                  returnTo={selfPath}
                />
              </div>
            )
          )}
        </CardContent>
      </Card>

      {offered && (
        <OfferCard info={info} hoursLeft={hoursUntil(info.offer_expires_at)}>
          {asSeeker ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{tOffer("answerHint", { name: otherName })}</p>
              {live ? (
                <div className="flex flex-wrap items-start gap-3">
                  <AcceptForm requestId={info.id} userId={user.id} landlordName={otherName} returnTo={selfPath} />
                  <WithdrawButton requestId={info.id} offer />
                </div>
              ) : (
                <>
                  <p className="text-sm text-amber-800">{tOffer("offerPaused")}</p>
                  <WithdrawButton requestId={info.id} offer />
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{tOffer("waitingFor", { name: otherName })}</p>
              <RequestActions
                requestId={info.id}
                status={info.status}
                canShortlist={false}
                basePath={adRequestsPath}
                tab="shortlisted"
                returnTo={selfPath}
              />
            </div>
          )}
        </OfferCard>
      )}

      {confirmed && details && <TenancyCard info={info} details={details} />}

      <Thread
        requestId={info.id}
        meId={user.id}
        side={info.my_side}
        seekerId={info.tenant_id}
        counterpartId={asSeeker ? info.poster_id : info.tenant_id}
        initialMessages={thread.messages}
        initialHasMore={thread.hasMore}
        people={thread.people}
        requestMessage={info.message}
        requestSentAt={info.created_at}
        events={threadEvents(info)}
        sendBlock={info.send_block}
        messagesLeft={info.messages_left}
      />
    </div>
  );
}
