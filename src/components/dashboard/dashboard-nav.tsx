"use client";

import {
  Building2,
  Heart,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Search,
  Send,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { AppMode } from "@/types/database";
import { ModeSwitchButton } from "./mode-switch-button";

type Item = {
  key: "overview" | "searchAds" | "myRequests" | "savedAds" | "myProperties" | "myAds" | "requestsInbox" | "profile";
  icon: LucideIcon;
  /** Null until the feature that owns the page is built. */
  href: string | null;
};

// Each mode only shows what that person uses (plan section 1.2).
const MENUS: Record<AppMode, Item[]> = {
  seek: [
    { key: "overview", icon: LayoutDashboard, href: "/dashboard" },
    { key: "searchAds", icon: Search, href: "/ads" },
    { key: "myRequests", icon: Send, href: null }, // F6
    { key: "savedAds", icon: Heart, href: null }, // F10
    { key: "profile", icon: UserRound, href: "/dashboard/profile" },
  ],
  host: [
    { key: "overview", icon: LayoutDashboard, href: "/dashboard" },
    { key: "myProperties", icon: Building2, href: "/dashboard/properties" },
    { key: "myAds", icon: Megaphone, href: "/dashboard/ads" },
    { key: "requestsInbox", icon: Inbox, href: null }, // F6
    { key: "profile", icon: UserRound, href: "/dashboard/profile" },
  ],
};

export function DashboardNav({ mode }: { mode: AppMode }) {
  const t = useTranslations("Dashboard");
  const tCommon = useTranslations("Common");
  const tNav = useTranslations("Nav");
  const pathname = usePathname();

  return (
    <nav aria-label={tNav("dashboard")} className="flex flex-col gap-3">
      <p className="hidden px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:block">
        {mode === "host" ? tNav("modeHost") : tNav("modeSeek")}
      </p>
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {MENUS[mode].map(({ key, icon: Icon, href }) => {
          const active =
            href !== null && (pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/")));
          const content = (
            <>
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{t(key)}</span>
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
