"use client";

import { ArrowLeft, Flag, LayoutDashboard, ListChecks, UsersRound, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { AdminCounts } from "@/lib/data/admin";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = { key: "overview" | "queue" | "reports" | "users"; icon: LucideIcon; href: string; count?: number };

/** Menu of the admin pages. Same shape as the dashboard menu (a scrolling row on phones). */
export function AdminNav({ counts }: { counts: AdminCounts }) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);

  const items: Item[] = [
    { key: "overview", icon: LayoutDashboard, href: "/admin" },
    { key: "queue", icon: ListChecks, href: "/admin/queue", count: counts.review },
    { key: "reports", icon: Flag, href: "/admin/reports", count: counts.reported },
    { key: "users", icon: UsersRound, href: "/admin/users" },
  ];

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    const listBox = list.getBoundingClientRect();
    const itemBox = active.getBoundingClientRect();
    list.scrollLeft += itemBox.left - listBox.left - (listBox.width - itemBox.width) / 2;
  }, [pathname]);

  return (
    <nav aria-label={t("navLabel")} className="flex flex-col gap-3">
      <p className="hidden px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:block">
        {t("title")}
      </p>
      <ul
        ref={listRef}
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
      >
        {items.map(({ key, icon: Icon, href, count }) => {
          const active = pathname === href || (href !== "/admin" && pathname.startsWith(href + "/"));
          return (
            <li key={key} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                  active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{t(key)}</span>
                {count ? (
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      active ? "bg-primary-foreground/20" : "bg-accent/20 text-amber-800",
                    )}
                  >
                    {formatNumber(count, locale)}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/dashboard"
        className="hidden items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground lg:flex"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("backToDashboard")}
      </Link>
    </nav>
  );
}
