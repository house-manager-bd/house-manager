import type { Metadata } from "next";
import { CircleAlert, ImageOff, Search, Send, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { getMyRequests } from "@/lib/data/requests";
import { formatDateTime, formatNumber, formatTaka } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { OPEN_REQUEST_LIMIT, OPEN_STATUSES } from "@/lib/validation/request";
import type { MyRequestRow } from "@/types/database";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestDetails } from "@/components/requests/request-details";
import { WithdrawButton } from "@/components/requests/withdraw-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Requests");
  return { title: t("title"), robots: { index: false } };
}

const isOpen = (r: MyRequestRow) => (OPEN_STATUSES as readonly string[]).includes(r.status);

/** "My requests": the seeker's requests and the landlords' answers (F6). */
export default async function MyRequestsPage({ searchParams }: PageProps<"/[locale]/dashboard/requests">) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "closed" ? "closed" : "open";
  const [t, locale, user, tree, requests] = await Promise.all([
    getTranslations("Requests"),
    getLocale(),
    getCurrentUser(),
    getLocationTree(),
    getMyRequests(),
  ]);
  if (!user) return null;

  const open = requests.filter(isOpen);
  const closed = requests.filter((r) => !isOpen(r));
  const shown = tab === "open" ? open : closed;
  const tabs = [
    { key: "open", label: t("tabOpen"), count: open.length, href: "/dashboard/requests" },
    { key: "closed", label: t("tabClosed"), count: closed.length, href: "/dashboard/requests?tab=closed" },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
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

      <nav className="flex gap-1 border-b" aria-label={t("title")}>
        {tabs.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={tab === item.key ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium",
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
            <CardTitle className="text-base font-medium">{tab === "open" ? t("emptyOpen") : t("emptyClosed")}</CardTitle>
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
              variant={r.status === "shortlisted" ? "success" : r.status === "pending" ? "warning" : "muted"}
              className={r.status === "declined" ? "bg-destructive/10 text-destructive" : undefined}
            >
              {r.status === "shortlisted" && <Star className="size-3" aria-hidden />}
              {tEnum(`requestStatus.${r.status}`)}
            </Badge>
            <Badge variant="outline">{tEnum(`listingType.${r.listing_type}`)}</Badge>
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
        <StatusNote request={r} live={live} t={t} tEnum={tEnum} />

        <details className="group rounded-lg border bg-muted/30 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">{t("yourDetails")}</summary>
          <div className="pt-3 pb-1">
            <RequestDetails request={r} />
          </div>
        </details>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">{t("sentOn", { date: formatDateTime(r.created_at, locale) })}</span>
          <div className="flex flex-wrap items-start gap-2">
            {live && (
              <Button asChild size="sm" variant={r.status === "shortlisted" ? "default" : "outline"}>
                <Link href={`/ads/${r.listing_id}`}>{t("openAd")}</Link>
              </Button>
            )}
            {isOpen(r) && <WithdrawButton requestId={r.id} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusNote({
  request: r,
  live,
  t,
  tEnum,
}: {
  request: MyRequestRow;
  live: boolean;
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
  if (r.status === "withdrawn") notes.push(<p key="w">{t("withdrawnNote")}</p>);
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
