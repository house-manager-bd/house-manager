import type { Metadata } from "next";
import { ArrowRight, Building2, Megaphone, Sparkles, UserRoundPen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentPrivateProfile, getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { getMyListings } from "@/lib/data/listings";
import { getMyBuildings } from "@/lib/data/properties";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ModeSwitchButton } from "@/components/dashboard/mode-switch-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Nav");
  return { title: t("dashboard"), robots: { index: false } };
}

export default async function DashboardPage() {
  const t = await getTranslations("Dashboard");
  const [user, profile, privateProfile] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
    getCurrentPrivateProfile(),
  ]);
  if (!user || !profile?.default_mode) return null; // The layout redirects first.

  const mode = profile.default_mode;
  const [buildings, ads] =
    mode === "host"
      ? await Promise.all([getMyBuildings(user.id), getMyListings(user.id)])
      : [[], []];
  const firstName = profile.full_name.trim().split(/\s+/)[0];
  const profileIncomplete =
    !profile.full_name.trim() || !profile.avatar_url || !privateProfile?.phone;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">
          {firstName ? t("welcome", { name: firstName }) : t("welcomeNoName")}
        </h1>
        <p className="text-muted-foreground">
          {mode === "host" ? t("hostIntro") : t("seekIntro")}
        </p>
      </div>

      {profileIncomplete && (
        <Card className="border-accent/50 bg-accent/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRoundPen className="size-5 text-accent" aria-hidden />
              {t("completeProfileTitle")}
            </CardTitle>
            <CardDescription>{t("completeProfileBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/profile">
                {t("completeProfileCta")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {mode === "host" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" aria-hidden />
                {t("hostStartTitle")}
              </CardTitle>
              <CardDescription>{t("nextStepsHost")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 text-sm">
                <Link href="/dashboard/properties" className="flex items-center gap-2 hover:underline">
                  <Building2 className="size-4 text-muted-foreground" aria-hidden />
                  {t("myPropertiesCount", { count: buildings.length })}
                </Link>
                <Link href="/dashboard/ads" className="flex items-center gap-2 hover:underline">
                  <Megaphone className="size-4 text-muted-foreground" aria-hidden />
                  {t("myAdsCount", { count: ads.length })}
                </Link>
              </div>
              <Button asChild className="w-fit">
                <Link href="/post">
                  {t("postAd")}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" aria-hidden />
                {t("nextStepsTitle")}
              </CardTitle>
              <CardDescription>{t("nextStepsSeek")}</CardDescription>
            </CardHeader>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>{t("switchCardTitle")}</CardTitle>
            <CardDescription>
              {mode === "host" ? t("switchCardHost") : t("switchCardSeek")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ModeSwitchButton mode={mode} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
