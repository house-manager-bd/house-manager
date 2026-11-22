import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentProfile, getCurrentUser, isAdminProfile } from "@/lib/auth";
import { getUnreadNotificationCount } from "@/lib/data/notifications";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const t = await getTranslations("Nav");
  // getCurrentUser checks the session token locally, so asking for the
  // bell's number only for members costs visitors nothing.
  const user = await getCurrentUser();
  const [profile, unreadNotifications] = await Promise.all([
    getCurrentProfile(),
    user ? getUnreadNotificationCount() : Promise.resolve(0),
  ]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:h-16">
        <Logo />
        {/* Tight gaps on phones: with the bell (F9), English pages need every pixel at 360px. */}
        <nav className="flex items-center gap-0.5 sm:gap-2">
          <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
            <Link href="/ads" aria-label={t("findHome")}>
              <Search aria-hidden />
              <span className="hidden sm:inline">{t("findHome")}</span>
            </Link>
          </Button>
          <LanguageSwitcher signedIn={!!user} />
          {user && <NotificationBell userId={user.id} initialCount={unreadNotifications} />}
          {user ? (
            <UserMenu
              fullName={profile?.full_name ?? ""}
              email={user.email}
              avatarUrl={profile?.avatar_url ?? null}
              mode={profile?.default_mode ?? null}
              isAdmin={isAdminProfile(profile)}
            />
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">{t("login")}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/signup">{t("signup")}</Link>
              </Button>
              <Button asChild size="sm" className="sm:hidden">
                <Link href="/login">{t("login")}</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
