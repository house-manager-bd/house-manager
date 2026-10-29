import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAdminCounts, getHiddenAds, getReviewQueue } from "@/lib/data/admin";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AdReviewCard } from "@/components/admin/ad-review-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return { title: t("queueTitle"), robots: { index: false } };
}

export default async function AdminQueuePage({ searchParams }: PageProps<"/[locale]/admin/queue">) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "hidden" ? "hidden" : "review";
  const [t, locale, user, tree, counts, ads] = await Promise.all([
    getTranslations("Admin"),
    getLocale(),
    getCurrentUser(),
    getLocationTree(),
    getAdminCounts(),
    tab === "hidden" ? getHiddenAds() : getReviewQueue(),
  ]);
  if (!user) return null;

  const tabs = [
    { key: "review", label: t("tabReview"), count: counts.review, href: "/admin/queue" },
    { key: "hidden", label: t("tabHidden"), count: counts.hidden, href: "/admin/queue?tab=hidden" },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("queueTitle")}</h1>
        <p className="max-w-2xl text-muted-foreground">{tab === "hidden" ? t("hiddenIntro") : t("queueIntro")}</p>
      </div>

      <nav className="flex gap-1 border-b" aria-label={t("queueTitle")}>
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

      {ads.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <CircleCheck className="size-8 text-primary" aria-hidden />
          <p className="font-medium">{tab === "hidden" ? t("hiddenEmpty") : t("queueEmpty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {ads.map((ad) => (
            <li key={ad.id}>
              <AdReviewCard
                ad={ad}
                viewerId={user.id}
                areaName={ad.areaId ? areaLabel(tree, ad.areaId, locale) : ""}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
