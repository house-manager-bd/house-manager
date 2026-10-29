"use client";

import {
  Building2,
  Heart,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppMode } from "@/types/database";
import { ModeSwitchButton } from "./mode-switch-button";

type Item = {
  key:
    | "overview"
    | "searchAds"
    | "myRequests"
    | "savedAds"
    | "myProperties"
    | "myAds"
    | "requestsInbox"
    | "profile"
    | "admin";
  icon: LucideIcon;
  /** Null until the feature that owns the page is built. */
  href: string | null;
};

// Each mode only shows what that person uses (plan section 1.2).
const MENUS: Record<AppMode, Item[]> = {
  seek: [
    { key: "overview", icon: LayoutDashboard, href: "/dashboard" },
    { key: "searchAds", icon: Search, href: "/ads" },
    { key: "myRequests", icon: Send, href: "/dashboard/requests" },
    { key: "savedAds", icon: Heart, href: null }, // F10
    { key: "profile", icon: UserRound, href: "/dashboard/profile" },
  ],
  host: [
    { key: "overview", icon: LayoutDashboard, href: "/dashboard" },
    { key: "myProperties", icon: Building2, href: "/dashboard/properties" },
    { key: "myAds", icon: Megaphone, href: "/dashboard/ads" },
    { key: "requestsInbox", icon: Inbox, href: "/dashboard/inbox" },
    { key: "profile", icon: UserRound, href: "/dashboard/profile" },
  ],
};

// Team admins also get a link to the admin pages (F5), in both modes.
const ADMIN_ITEM: Item = { key: "admin", icon: ShieldCheck, href: "/admin" };

/** One ad's requests (/dashboard/ads/id/requests) belong to the inbox, not to My ads. */
const AD_REQUESTS = /^\/dashboard\/ads\/[^/]+\/requests$/;

function isActive(key: Item["key"], href: string | null, pathname: string) {
  if (href === null) return false;
  if (AD_REQUESTS.test(pathname)) return key === "requestsInbox";
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
}

export function DashboardNav({
  mode,
  isAdmin = false,
  badges = {},
}: {
  mode: AppMode;
  isAdmin?: boolean;
  /** Counts shown next to menu items, such as new requests in the inbox (F6). */
  badges?: Partial<Record<Item["key"], number>>;
}) {
  const t = useTranslations("Dashboard");
  const tCommon = useTranslations("Common");
  const tNav = useTranslations("Nav");
  const locale = useLocale();
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);

  // On phones the menu is one row that scrolls sideways. Bring the current
  // page's item into view, so "My ads" is not hidden off the right edge.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    const listBox = list.getBoundingClientRect();
    const itemBox = active.getBoundingClientRect();
    list.scrollLeft += itemBox.left - listBox.left - (listBox.width - itemBox.width) / 2;
  }, [pathname]);

  return (
    <nav aria-label={tNav("dashboard")} className="flex flex-col gap-3">
      <p className="hidden px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:block">
        {mode === "host" ? tNav("modeHost") : tNav("modeSeek")}
      </p>
      <ul
        ref={listRef}
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
      >
        {(isAdmin ? [...MENUS[mode], ADMIN_ITEM] : MENUS[mode]).map(({ key, icon: Icon, href }) => {
          const active = isActive(key, href, pathname);
          const badge = badges[key] ?? 0;
          const content = (
            <>
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{t(key)}</span>
              {badge > 0 && (
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    active ? "bg-primary-foreground text-primary" : "bg-accent text-accent-foreground",
                  )}
                  aria-label={t("newBadge", { count: badge })}
                >
                  {formatNumber(badge, locale)}
                </span>
              )}
              {href === null && (
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {tCommon("soon")}
                </span>
              )}
            </>
          );
          const classes = cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
            active
              ? "bg-primary text-primary-foreground"
              : href
                ? "text-foreground hover:bg-muted"
                : "cursor-not-allowed text-muted-foreground",
          );
          return (
            <li key={key} className="shrink-0">
              {href ? (
                <Link href={href} className={classes} aria-current={active ? "page" : undefined}>
                  {content}
                </Link>
              ) : (
                <span className={classes} aria-disabled="true">
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <ModeSwitchButton mode={mode} variant="ghost" className="hidden lg:inline-flex" />
    </nav>
  );
}
