import type { Metadata } from "next";
import { BadgeCheck, CircleAlert, Handshake, ImageOff, MessagesSquare, Search, Send, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { getMyRequests } from "@/lib/data/requests";
import { formatDate, formatDateTime, formatNumber, formatTaka } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { OPEN_REQUEST_LIMIT, OPEN_STATUSES } from "@/lib/validation/request";
import type { MyRequestRow } from "@/types/database";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveRefresh } from "@/components/messages/live-refresh";
import { RequestDetails } from "@/components/requests/request-details";
import { WithdrawButton } from "@/components/requests/withdraw-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Requests");
  return { title: t("title"), robots: { index: false } };
}

const isOpen = (r: MyRequestRow) => (OPEN_STATUSES as readonly string[]).includes(r.status);

/** "My requests": the seeker's requests and the landlords' answers (F6), offers and confirmed places (F8). */
export default async function MyRequestsPage({ searchParams }: PageProps<"/[locale]/dashboard/requests">) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "closed" ? "closed" : tabParam === "confirmed" ? "confirmed" : "open";
  const [t, locale, user, tree, requests] = await Promise.all([
    getTranslations("Requests"),
    getLocale(),
    getCurrentUser(),
    getLocationTree(),
    getMyRequests(),
  ]);
  if (!user) return null;

  // Offers first: they wait for an answer, and run out after 48 hours.
  const open = requests.filter(isOpen).sort((a, b) => Number(b.status === "offered") - Number(a.status === "offered"));
  const confirmed = requests.filter((r) => r.status === "confirmed");
  const closed = requests.filter((r) => !isOpen(r) && r.status !== "confirmed");
  const shown = tab === "open" ? open : tab === "confirmed" ? confirmed : closed;
  const tabs = [
    { key: "open", label: t("tabOpen"), count: open.length, href: "/dashboard/requests" },
    { key: "confirmed", label: t("tabConfirmed"), count: confirmed.length, href: "/dashboard/requests?tab=confirmed" },
    { key: "closed", label: t("tabClosed"), count: closed.length, href: "/dashboard/requests?tab=closed" },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh requests />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
        <p className="text-sm text-muted-foreground">
          <span className={cn("font-medium", open.length >= OPEN_REQUEST_LIMIT ? "text-destructive" : "text-foreground")}>
            {t("openCount", { count: open.length, limit: OPEN_REQUEST_LIMIT })}
          </span>
          {open.length >= OPEN_REQUEST_LIMIT && <> · {t("limitHint", { limit: OPEN_REQUEST_LIMIT })}</>}
        </p>
      </div>

      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0" aria-label={t("title")}>
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
        <Card className="items-center py-12 text-center">
          <CardHeader className="w-full justify-items-center">
            <span className="mb-2 grid size-12 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <Send className="size-6" aria-hidden />
            </span>
            <CardTitle className="text-base font-medium">
              {tab === "open" ? t("emptyOpen") : tab === "confirmed" ? t("emptyConfirmed") : t("emptyClosed")}
            </CardTitle>
          </CardHeader>
          {tab === "open" && (
            <CardContent>
              <Button asChild>
                <Link href="/ads">
                  <Search aria-hidden />
                  {t("searchAds")}
                </Link>
              </Button>
            </CardContent>
          )}
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((r) => (
            <li key={r.id}>
              <RequestCard request={r} area={areaLabel(tree, r.area_id, locale)} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function RequestCard({ request: r, area, locale }: { request: MyRequestRow; area: string; locale: string }) {
  const [t, tEnum] = await Promise.all([getTranslations("Requests"), getTranslations("Enums")]);
  const live = r.listing_status === "active";
  const title = r.listing_title ?? t("untitledAd");

  return (
    <Card className="gap-4 py-5">
      <div className="flex gap-4 px-6">
        <div className="hidden aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-md border bg-muted sm:block">
          {r.cover_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl(r.cover_path)} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <span className="grid size-full place-items-center text-muted-foreground">
              <ImageOff className="size-5" aria-hidden />
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                r.status === "shortlisted" || r.status === "confirmed"
                  ? "success"
                  : r.status === "pending" || r.status === "offered"
                    ? "warning"
                    : "muted"
              }
              className={r.status === "declined" ? "bg-destructive/10 text-destructive" : undefined}
            >
              {r.status === "shortlisted" && <Star className="size-3" aria-hidden />}
              {r.status === "offered" && <Handshake className="size-3" aria-hidden />}
              {r.status === "confirmed" && <BadgeCheck className="size-3" aria-hidden />}
              {tEnum(`requestStatus.${r.status}`)}
            </Badge>
            <Badge variant="outline">{tEnum(`listingType.${r.listing_type}`)}</Badge>
            {r.unread_count > 0 && (
              <Badge className="bg-accent text-accent-foreground">
                <MessagesSquare className="size-3" aria-hidden />
                {t("unreadCount", { count: r.unread_count })}
              </Badge>
            )}
          </div>
          <h2 className="font-semibold break-words sm:text-lg">
            {live ? (
              <Link href={`/ads/${r.listing_id}`} className="hover:underline">
                {title}
              </Link>
            ) : (
              title
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {area}
            {r.monthly_rent !== null && <> · {formatTaka(r.monthly_rent, locale)}</>}
          </p>
          {r.poster_name && <p className="text-sm text-muted-foreground">{t("postedBy", { name: r.poster_name })}</p>}
        </div>
      </div>

      <CardContent className="flex flex-col gap-4">
        <StatusNote request={r} live={live} locale={locale} t={t} tEnum={tEnum} />

        <details className="group rounded-lg border bg-muted/30 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">{t("yourDetails")}</summary>
          <div className="pt-3 pb-1">
            <RequestDetails request={r} />
          </div>
        </details>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">{t("sentOn", { date: formatDateTime(r.created_at, locale) })}</span>
          <div className="flex flex-wrap items-start gap-2">
            {r.status === "offered" && (
              <Button asChild size="sm">
                <Link href={`/dashboard/requests/${r.id}#offer`}>
                  <Handshake aria-hidden />
                  {t("seeOffer")}
                </Link>
              </Button>
            )}
            {r.status === "confirmed" && (
              <Button asChild size="sm">
                <Link href={`/dashboard/requests/${r.id}#tenancy`}>
                  <BadgeCheck aria-hidden />
                  {t("seeTenancy")}
                </Link>
              </Button>
            )}
            {(isOpen(r) || r.status === "confirmed" || r.message_count > 0) && (
              <Button asChild size="sm" variant={r.unread_count > 0 ? "default" : "outline"}>
                <Link href={`/dashboard/requests/${r.id}`}>
                  <MessagesSquare aria-hidden />
                  {r.message_count > 0 ? t("openMessages") : t("writeMessage")}
                </Link>
              </Button>
            )}
            {live && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/ads/${r.listing_id}`}>{t("openAd")}</Link>
              </Button>
            )}
            {isOpen(r) && r.status !== "offered" && <WithdrawButton requestId={r.id} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusNote({
  request: r,
  live,
  locale,
  t,
  tEnum,
}: {
  request: MyRequestRow;
  live: boolean;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations<"Requests">>>;
  tEnum: Awaited<ReturnType<typeof getTranslations<"Enums">>>;
}) {
  const notes: React.ReactNode[] = [];
  if (r.status === "pending") notes.push(<p key="p">{t("pendingNote")}</p>);
  if (r.status === "shortlisted") {
    notes.push(
      <p key="s" className="rounded-md bg-primary/5 px-3 py-2 text-primary">
        {t("shortlistedNote")}
      </p>,
    );
  }
  if (r.status === "declined" && r.decline_reason) {
    notes.push(
      <div key="d" className="flex flex-col gap-1 rounded-md bg-destructive/5 px-3 py-2 text-destructive">
        <p>{t("declinedReason", { reason: tEnum(`declineReason.${r.decline_reason}`) })}</p>
        {r.decline_note && <p className="break-words whitespace-pre-line text-foreground">{t("landlordNote", { note: r.decline_note })}</p>}
      </div>,
    );
  }
  if (r.status === "offered" && r.offer_rent !== null && r.offer_start_date && r.offer_expires_at) {
    notes.push(
      <p key="o" className="flex items-start gap-1.5 rounded-md bg-accent/10 px-3 py-2 font-medium text-amber-800">
        <Handshake className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("offeredNote", {
          rent: formatTaka(r.offer_rent, locale),
          date: formatDate(r.offer_start_date, locale),
          until: formatDateTime(r.offer_expires_at, locale),
        })}
      </p>,
    );
  }
  if (r.status === "confirmed" && r.offer_start_date) {
    notes.push(
      <p key="c" className="flex items-start gap-1.5 rounded-md bg-primary/5 px-3 py-2 text-primary">
        <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("confirmedNote", { date: formatDate(r.offer_start_date, locale) })}
      </p>,
    );
  }
  if (r.status === "expired" && r.offered_at) notes.push(<p key="e">{t("offerExpiredNote")}</p>);
  if (r.status === "withdrawn") notes.push(<p key="w">{r.offered_at ? t("turnedDownNote") : t("withdrawnNote")}</p>);
  if (!live && isOpen(r)) {
    notes.push(
      <p key="n" className="flex items-center gap-1.5 text-amber-800">
        <CircleAlert className="size-4 shrink-0" aria-hidden />
        {t("adNotLive")}
      </p>,
    );
  }
  if (!notes.length) return null;
  return <div className="flex flex-col gap-2 text-sm text-muted-foreground">{notes}</div>;
}
