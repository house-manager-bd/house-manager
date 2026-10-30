import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, Inbox, MessagesSquare, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getListingThreadCounts } from "@/lib/data/messages";
import { getListingInbox, type InboxRequest } from "@/lib/data/requests";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { cn, nameInitials } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FormSuccessStatic } from "@/components/ui/success-note";
import { LiveRefresh } from "@/components/messages/live-refresh";
import { PhoneLinks } from "@/components/requests/phone-links";
import { RequestActions } from "@/components/requests/request-actions";
import { RequestDetails } from "@/components/requests/request-details";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS = ["new", "shortlisted", "closed"] as const;
type Tab = (typeof TABS)[number];

function tabOf(r: InboxRequest): Tab {
  if (r.status === "pending") return "new";
  if (r.status === "shortlisted" || r.status === "offered") return "shortlisted";
  return "closed";
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Inbox");
  return { title: t("adTitle"), robots: { index: false } };
}

/** One ad's requests for its landlord: shortlist or decline (F6). */
export default async function ListingRequestsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/ads/[listingId]/requests">) {
  const { listingId } = await params;
  const query = await searchParams;
  if (!UUID.test(listingId)) notFound();
  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : "new";

  const [t, tEnum, locale, user, inbox, threadCounts] = await Promise.all([
    getTranslations("Inbox"),
    getTranslations("Enums"),
    getLocale(),
    getCurrentUser(),
    getListingInbox(listingId),
    getListingThreadCounts(listingId),
  ]);
  if (!user) return null;
  // Not the poster or a manager of the building (admins included).
  if (!inbox) notFound();

  const { listing, requests } = inbox;
  const live = listing.status === "active";
  const shown = requests.filter((r) => tabOf(r) === tab);
  const count = (key: Tab) => requests.filter((r) => tabOf(r) === key).length;
  const basePath = `/dashboard/ads/${listing.id}/requests`;
  const tabs = TABS.map((key) => ({
    key,
    label: t(key === "new" ? "tabNew" : key === "shortlisted" ? "tabShortlisted" : "tabClosed"),
    count: count(key),
    href: key === "new" ? basePath : `${basePath}?tab=${key}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh />
      <Link
        href="/dashboard/inbox"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("allRequests")}
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("adTitle")}</h1>
        <p className="font-medium break-words">
          <Link href={`/ads/${listing.id}`} className="hover:underline">
            {listing.title ?? tEnum(`listingType.${listing.listing_type}`)}
          </Link>
        </p>
        <p className="text-sm text-muted-foreground">
          {t("adIsFor", { types: listing.tenant_types.map((x) => tEnum(`tenantType.${x as "family"}`)).join(", ") })}
        </p>
      </div>

      {query.done === "shortlisted" && <FormSuccessStatic title={t("doneShortlisted")} />}
      {query.done === "declined" && <FormSuccessStatic title={t("doneDeclined")} />}
      {!live && (
        <Alert>
          <CircleAlert aria-hidden />
          <span className="text-foreground">
            {t("adNotLive", { status: tEnum(`listingStatus.${listing.status}`) })}
          </span>
        </Alert>
      )}

      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0" aria-label={t("adTitle")}>
        {tabs.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={tab === item.key ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
              tab === item.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{formatNumber(item.count, locale)}</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <CardContent className="flex flex-col items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <Inbox className="size-6" aria-hidden />
            </span>
            <p className="text-muted-foreground">
              {tab === "new" ? t("emptyNew") : tab === "shortlisted" ? t("emptyShortlisted") : t("emptyClosed")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((r) => {
            const name = r.seeker?.full_name || t("member");
            const shared = r.status === "shortlisted" || r.status === "offered";
            const counts = threadCounts.get(r.id);
            const open = r.status === "pending" || shared;
            return (
              <li key={r.id} id={`r-${r.id}`} className="scroll-mt-24">
                <Card className="gap-4 py-5">
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="size-12 border">
                        {r.seeker?.avatar_url && <AvatarImage src={r.seeker.avatar_url} alt="" referrerPolicy="no-referrer" />}
                        <AvatarFallback>{nameInitials(name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold break-words">{name}</span>
                          <Badge
                            variant={r.status === "pending" ? "warning" : r.status === "shortlisted" ? "success" : "muted"}
                          >
                            {r.status === "shortlisted" && <Star className="size-3" aria-hidden />}
                            {t(`status.${r.status}`)}
                          </Badge>
                          {r.seeker?.is_banned && (
                            <Badge variant="outline" className="border-destructive/40 text-destructive">
                              {t("suspended")}
                            </Badge>
                          )}
                          {counts && counts.unread_count > 0 && (
                            <Badge className="bg-accent text-accent-foreground">
                              <MessagesSquare className="size-3" aria-hidden />
                              {t("unreadCount", { count: counts.unread_count })}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {r.seeker && <>{t("memberSince", { date: formatDate(r.seeker.created_at, locale) })} · </>}
                          {t("receivedOn", { date: formatDateTime(r.created_at, locale) })}
                        </span>
                      </div>
                    </div>

                    <RequestDetails request={r} />

                    {shared && (
                      <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                        <span className="text-xs font-medium text-muted-foreground">{t("phone")}</span>
                        {r.seeker?.phone ? (
                          <PhoneLinks phone={r.seeker.phone} />
                        ) : (
                          <span className="text-sm text-muted-foreground">{t("noPhone")}</span>
                        )}
                      </div>
                    )}

                    {r.status === "declined" && r.decline_reason && (
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        <p>{t("declinedWith", { reason: tEnum(`declineReason.${r.decline_reason}`) })}</p>
                        {r.decline_note && (
                          <p className="break-words whitespace-pre-line">{t("yourNote", { note: r.decline_note })}</p>
                        )}
                      </div>
                    )}

                    {(open || counts) && (
                      <Button asChild size="sm" variant={counts && counts.unread_count > 0 ? "default" : "outline"} className="w-fit">
                        <Link href={`/dashboard/requests/${r.id}`}>
                          <MessagesSquare aria-hidden />
                          {counts ? t("openMessages") : t("writeMessage")}
                        </Link>
                      </Button>
                    )}

                    <RequestActions
                      requestId={r.id}
                      status={r.status}
                      canShortlist={live && !r.seeker?.is_banned}
                      basePath={basePath}
                      tab={tab}
                    />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
