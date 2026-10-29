import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { getReportedAds } from "@/lib/data/admin";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { AdReviewCard } from "@/components/admin/ad-review-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return { title: t("reportsTitle"), robots: { index: false } };
}

export default async function AdminReportsPage() {
  const [t, locale, user, tree, ads] = await Promise.all([
    getTranslations("Admin"),
    getLocale(),
    getCurrentUser(),
    getLocationTree(),
    getReportedAds(),
  ]);
  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("reportsTitle")}</h1>
        <p className="max-w-2xl text-muted-foreground">{t("reportsIntro")}</p>
      </div>

      {ads.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <CircleCheck className="size-8 text-primary" aria-hidden />
          <p className="font-medium">{t("reportsEmpty")}</p>
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
