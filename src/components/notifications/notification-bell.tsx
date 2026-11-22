"use client";

import { Bell } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useNotificationCount } from "./use-notification-count";

/** The header bell (F9): opens the notifications page, with a live unread number. */
export function NotificationBell({ userId, initialCount }: { userId: string; initialCount: number }) {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const count = useNotificationCount(userId, initialCount);

  return (
    <Button asChild variant="ghost" size="sm" className="relative px-1.5 sm:px-2">
      <Link href="/dashboard/notifications" aria-label={t("bellLabel", { count })}>
        <Bell className="size-5" aria-hidden />
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-bold text-accent-foreground ring-2 ring-background"
            aria-hidden
          >
            {count > 99 ? `${formatNumber(99, locale)}+` : formatNumber(count, locale)}
          </span>
        )}
      </Link>
    </Button>
  );
}
