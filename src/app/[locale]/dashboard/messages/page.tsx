import type { Metadata } from "next";
import { Inbox, MessagesSquare, Send } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { getMessageThreads } from "@/lib/data/messages";
import { formatNumber, formatShortMoment } from "@/lib/format";
import { OPEN_STATUSES } from "@/lib/validation/request";
import { cn, nameInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveRefresh } from "@/components/messages/live-refresh";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Conversations");
  return { title: t("title"), robots: { index: false } };
}

/**
 * "Messages": every thread the member is part of, as a seeker or on the
 * landlord side, newest first (F7). Shown in both modes, so a landlord who
 * also looks for a place sees every conversation in one list.
 */
export default async function MessagesPage() {
  const [t, tEnum, locale, user, profile, threads] = await Promise.all([
    getTranslations("Conversations"),
    getTranslations("Enums"),
    getLocale(),
    getCurrentUser(),
    getCurrentProfile(),
    getMessageThreads(),
  ]);
  if (!user) return null;
  const host = profile?.default_mode === "host";

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="max-w-2xl text-muted-foreground">{t("subtitle")}</p>
      </div>

      {threads.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <CardHeader className="w-full justify-items-center">
            <span className="mb-2 grid size-12 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <MessagesSquare className="size-6" aria-hidden />
            </span>
            <CardTitle className="text-base font-medium">{t("empty")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              {host ? (
                <Link href="/dashboard/inbox">
                  <Inbox aria-hidden />
                  {t("toInbox")}
                </Link>
              ) : (
                <Link href="/dashboard/requests">
                  <Send aria-hidden />
                  {t("toRequests")}
                </Link>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {threads.map((row) => {
              const name = row.other_name?.trim() || (row.my_side === "seeker" ? t("landlord") : t("member"));
              const unread = row.unread_count > 0;
              const closed = !(OPEN_STATUSES as readonly string[]).includes(row.request_status) && row.request_status !== "confirmed";
              return (
                <li key={row.request_id}>
                  <Link
                    href={`/dashboard/requests/${row.request_id}`}
                    className="flex items-start gap-3 px-4 py-4 hover:bg-muted/60 sm:px-6"
                  >
                    <Avatar className="size-11 border">
                      {row.other_avatar && <AvatarImage src={row.other_avatar} alt="" referrerPolicy="no-referrer" />}
                      <AvatarFallback>{nameInitials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={cn("min-w-0 truncate", unread ? "font-bold" : "font-semibold")}>{name}</span>
                        <time
                          dateTime={row.last_at}
                          className={cn("shrink-0 text-xs", unread ? "font-semibold text-primary" : "text-muted-foreground")}
                        >
                          {formatShortMoment(row.last_at, locale)}
                        </time>
                      </div>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.my_side === "seeker" ? t("yourRequest") : t("yourAd")} ·{" "}
                        {row.listing_title ?? tEnum(`listingType.${row.listing_type}`)}
                      </span>
                      <div className="flex items-center justify-between gap-3">
                        <span className={cn("min-w-0 truncate text-sm", unread ? "text-foreground" : "text-muted-foreground")}>
                          {row.last_from_me ? t("you", { text: row.last_body }) : row.last_body}
                        </span>
                        {unread ? (
                          <span
                            className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground"
                            aria-label={t("unread", { count: row.unread_count })}
                          >
                            {formatNumber(row.unread_count, locale)}
                          </span>
                        ) : (
                          closed && (
                            <Badge variant="muted" className="shrink-0">
                              {tEnum(`requestStatus.${row.request_status}`)}
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
