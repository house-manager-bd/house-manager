import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, ExternalLink, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { getThread } from "@/lib/data/messages";
import { formatDate, formatTaka } from "@/lib/format";
import { OPEN_STATUSES } from "@/lib/validation/request";
import type { ThreadInfoRow } from "@/types/database";
import { cn, nameInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormSuccessStatic } from "@/components/ui/success-note";
import { Thread, type ThreadEvent } from "@/components/messages/thread";
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
  if (info.closed_at) {
    if (info.status === "declined") {
      events.push({ kind: "declined", at: info.closed_at, reason: info.decline_reason, note: info.decline_note });
    } else if (info.status === "withdrawn" || info.status === "expired") {
      events.push({ kind: info.status, at: info.closed_at });
    }
  }
  return events;
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

  const [t, tEnum, tInbox, locale, user, tree, thread] = await Promise.all([
    getTranslations("Thread"),
    getTranslations("Enums"),
    getTranslations("Inbox"),
    getLocale(),
    getCurrentUser(),
    getLocationTree(),
    getThread(requestId),
  ]);
  if (!user) return null;
  if (!thread) notFound();

  const { info } = thread;
  const asSeeker = info.my_side === "seeker";
  const live = info.listing_status === "active";
  const open = (OPEN_STATUSES as readonly string[]).includes(info.status);
  const otherName = (asSeeker ? info.poster_name : info.seeker_name)?.trim() || (asSeeker ? t("landlord") : t("member"));
  const otherAvatar = asSeeker ? info.poster_avatar : info.seeker_avatar;
  const adTitle = info.listing_title ?? tEnum(`listingType.${info.listing_type}`);
  const selfPath = `/dashboard/requests/${info.id}`;
  const adRequestsPath = `/dashboard/ads/${info.listing_id}/requests`;
  const backHref = asSeeker
    ? `/dashboard/requests${open ? "" : "?tab=closed"}`
    : `${adRequestsPath}${info.status === "pending" ? "" : open ? "?tab=shortlisted" : "?tab=closed"}`;

  return (
    <div className="flex flex-col gap-4">
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
                  variant={info.status === "shortlisted" ? "success" : info.status === "pending" ? "warning" : "muted"}
                  className={info.status === "declined" ? "bg-destructive/10 text-destructive" : undefined}
                >
                  {info.status === "shortlisted" && <Star className="size-3" aria-hidden />}
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
            (open || live) && (
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
            <RequestActions
              requestId={info.id}
              status={info.status}
              canShortlist={live && !info.seeker_banned}
              basePath={adRequestsPath}
              tab={info.status === "pending" ? "new" : "shortlisted"}
              returnTo={selfPath}
            />
          )}
        </CardContent>
      </Card>

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
