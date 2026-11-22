import type { Metadata } from "next";
import { Bell, ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getEmailNotificationsEnabled,
  getNotifications,
  getUnreadNotificationCount,
} from "@/lib/data/notifications";
import { cursorParam, describeNotification, parseCursor } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveRefresh } from "@/components/messages/live-refresh";
import { EmailSettingsForm } from "@/components/notifications/email-settings-form";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { NotificationItem } from "@/components/notifications/notification-item";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Notifications");
  return { title: t("title"), robots: { index: false } };
}

/**
 * Notifications (F9): request steps and moderation decisions, newest first,
 * 30 at a time. Opening one marks it read and goes to its page. The email
 * choice sits at the bottom (#email, linked from every email).
 */
export default async function NotificationsPage({ searchParams }: PageProps<"/[locale]/dashboard/notifications">) {
  const query = await searchParams;
  const before = parseCursor(query.before);
  const [t, tEnum, locale, user, page, unread, emailEnabled] = await Promise.all([
    getTranslations("Notifications"),
    getTranslations("Enums"),
    getLocale(),
    getCurrentUser(),
    getNotifications(before),
    getUnreadNotificationCount(),
    getEmailNotificationsEnabled(),
  ]);
  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* A new notification shows without reloading. */}
      <LiveRefresh messages={false} notificationsFor={user.id} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
          <p className="max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        </div>
        {unread > 0 && <MarkAllReadButton />}
      </div>

      {page.items.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <CardHeader className="w-full justify-items-center">
            <span className="mb-2 grid size-12 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <Bell className="size-6" aria-hidden />
            </span>
            <CardTitle className="max-w-md text-base font-medium">{t("empty")}</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {page.items.map((n) => (
              <NotificationItem
                key={n.id}
                n={n}
                text={describeNotification(n, locale, t, tEnum)}
                locale={locale}
                unreadLabel={t("unread")}
              />
            ))}
          </ul>
        </Card>
      )}

      {(before || page.next) && (
        <nav className="flex flex-wrap justify-between gap-2">
          {before ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/notifications">
                <ChevronLeft aria-hidden />
                {t("newest")}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {page.next && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/notifications?before=${encodeURIComponent(cursorParam(page.next))}`}>
                {t("older")}
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          )}
        </nav>
      )}

      <Card id="email" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5 text-primary" aria-hidden />
            {t("emailTitle")}
          </CardTitle>
          <CardDescription className="break-words">{t("emailBody", { email: user.email })}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailSettingsForm enabled={emailEnabled} />
        </CardContent>
      </Card>
    </div>
  );
}
