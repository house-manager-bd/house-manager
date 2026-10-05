import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const t = await getTranslations("Nav");
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:h-16">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher signedIn={!!user} />
          {user ? (
            <UserMenu
              fullName={profile?.full_name ?? ""}
              email={user.email}
              avatarUrl={profile?.avatar_url ?? null}
              mode={profile?.default_mode ?? null}
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
