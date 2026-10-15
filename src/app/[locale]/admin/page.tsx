import type { Metadata } from "next";
import { Ban, EyeOff, Flag, ListChecks, type LucideIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getAdminCounts, getRecentActions } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return { title: t("title"), robots: { index: false } };
}

export default async function AdminOverviewPage() {
  const [t, tEnum, locale, counts, actions] = await Promise.all([
    getTranslations("Admin"),
    getTranslations("Enums"),
    getLocale(),
    getAdminCounts(),
    getRecentActions(20),
  ]);

  const tiles: { icon: LucideIcon; text: string; href: string; urgent: boolean }[] = [
    { icon: ListChecks, text: t("countReview", { count: counts.review }), href: "/admin/queue", urgent: counts.review > 0 },
    { icon: Flag, text: t("countReported", { count: counts.reported }), href: "/admin/reports", urgent: counts.reported > 0 },
    { icon: EyeOff, text: t("countHidden", { count: counts.hidden }), href: "/admin/queue?tab=hidden", urgent: false },
    { icon: Ban, text: t("countBanned", { count: counts.banned }), href: "/admin/users?filter=banned", urgent: false },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="max-w-2xl text-muted-foreground">{t("overviewIntro")}</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {tiles.map(({ icon: Icon, text, href, urgent }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                "flex h-full items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted",
                urgent && "border-accent/60 bg-accent/5",
              )}
            >
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-lg",
                  urgent ? "bg-accent/20 text-amber-800" : "bg-secondary text-secondary-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="font-medium">{text}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader>
          <CardTitle>{t("recentTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("recentEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {actions.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={a.action === "approve" || a.action === "restore" || a.action === "unban" ? "default" : "muted"}>
                      {tEnum(`moderationAction.${a.action}`)}
                    </Badge>
                    <span className="text-muted-foreground">
                      {a.admin?.full_name.trim() || t("system")} · {formatDate(a.created_at, locale)}
                    </span>
                  </span>
                  {a.listing ? (
                    <Link href={`/ads/${a.listing.id}`} className="w-fit font-medium break-words hover:underline">
                      {a.listing.title ?? t("untitled")}
                    </Link>
                  ) : a.user ? (
                    <Link
                      href={`/admin/users?q=${encodeURIComponent(a.user.full_name.trim())}`}
                      className="w-fit font-medium break-words hover:underline"
                    >
                      {a.user.full_name.trim() || t("noName")}
                    </Link>
                  ) : null}
                  {a.note && <span className="break-words text-muted-foreground">{a.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
