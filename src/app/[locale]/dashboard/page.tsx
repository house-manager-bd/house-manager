import type { Metadata } from "next";
import {
  ArrowRight,
  Ban,
  Building2,
  Inbox,
  Megaphone,
  MessagesSquare,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRoundPen,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentPrivateProfile, getCurrentProfile, getCurrentUser, isAdminProfile } from "@/lib/auth";
import { getAdminCounts } from "@/lib/data/admin";
import { getMyListings } from "@/lib/data/listings";
import { getUnreadMessageCount } from "@/lib/data/messages";
import { getMyBuildings } from "@/lib/data/properties";
import { getMyRequests, getNewRequestCount } from "@/lib/data/requests";
import { OPEN_STATUSES } from "@/lib/validation/request";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ModeSwitchButton } from "@/components/dashboard/mode-switch-button";
import { LiveRefresh } from "@/components/messages/live-refresh";

/** The project's contact address (shown to suspended members). */
const SUPPORT_EMAIL = "housemanagerbd@gmail.com";

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
  const [buildings, ads, newRequests] =
    mode === "host"
      ? await Promise.all([getMyBuildings(user.id), getMyListings(user.id), getNewRequestCount()])
      : [[], [], 0];
  const [myRequests, unreadMessages] = await Promise.all([
    mode === "seek" ? getMyRequests() : Promise.resolve([]),
    getUnreadMessageCount(),
  ]);
  const openRequests = myRequests.filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status)).length;
  const shortlistedFor = myRequests.filter((r) => r.status === "shortlisted").length;
  const isAdmin = isAdminProfile(profile);
  const [tAdmin, adminCounts] = await Promise.all([
    getTranslations("Admin"),
    isAdmin ? getAdminCounts() : Promise.resolve(null),
  ]);
  const firstName = profile.full_name.trim().split(/\s+/)[0];
  const profileIncomplete =
    !profile.full_name.trim() || !profile.avatar_url || !privateProfile?.phone;

  // Shown in both modes: a landlord may also be looking for a place (F7).
  const unreadLink = unreadMessages > 0 && (
    <Link href="/dashboard/messages" className="flex items-center gap-2 font-semibold text-amber-800 hover:underline">
      <MessagesSquare className="size-4 text-muted-foreground" aria-hidden />
      {t("unreadMessagesCount", { count: unreadMessages })}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">
          {firstName ? t("welcome", { name: firstName }) : t("welcomeNoName")}
        </h1>
        <p className="text-muted-foreground">
          {mode === "host" ? t("hostIntro") : t("seekIntro")}
        </p>
      </div>

      {profile.is_banned && (
        <Alert variant="destructive">
          <Ban aria-hidden />
          <span className="flex flex-col gap-1">
            <span className="font-semibold">{t("bannedTitle")}</span>
            <span className="text-foreground">{t("bannedBody")}</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="w-fit text-foreground underline underline-offset-2" dir="ltr">
              {SUPPORT_EMAIL}
            </a>
          </span>
        </Alert>
      )}

      {adminCounts && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden />
              {t("adminCardTitle")}
            </CardTitle>
            <CardDescription>{t("adminCardBody")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-1 text-sm">
              <li>{tAdmin("countReview", { count: adminCounts.review })}</li>
              <li>{tAdmin("countReported", { count: adminCounts.reported })}</li>
            </ul>
            <Button asChild variant="outline" className="w-fit">
              <Link href="/admin">
                {t("adminCardCta")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

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
                <Link
                  href="/dashboard/inbox"
                  className={`flex items-center gap-2 hover:underline ${newRequests > 0 ? "font-semibold text-amber-800" : ""}`}
                >
                  <Inbox className="size-4 text-muted-foreground" aria-hidden />
                  {t("newRequestsCount", { count: newRequests })}
                </Link>
                {unreadLink}
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
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 text-sm">
                <Link href="/dashboard/requests" className="flex items-center gap-2 hover:underline">
                  <Send className="size-4 text-muted-foreground" aria-hidden />
                  {t("openRequestsCount", { count: openRequests })}
                </Link>
                {shortlistedFor > 0 && (
                  <p className="font-medium text-primary">{t("shortlistedForCount", { count: shortlistedFor })}</p>
                )}
                {unreadLink}
              </div>
              <Button asChild className="w-fit">
                <Link href="/ads">
                  <Search aria-hidden />
                  {t("searchAds")}
                </Link>
              </Button>
            </CardContent>
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
