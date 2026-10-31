import { redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile, getCurrentUser, isAdminProfile } from "@/lib/auth";
import { getUnreadMessageCount } from "@/lib/data/messages";
import { getNewRequestCount } from "@/lib/data/requests";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";

export default async function DashboardLayout({
  children,
  params,
}: LayoutProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  const lang = locale as "bn" | "en";
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);

  // The proxy already sends visitors to /login. This is a second guard.
  if (!user) return redirect({ href: "/login", locale: lang });

  // A signed-in user without a profile row (should not happen once the F1
  // migration has run). Redirecting to /login here would loop, so explain.
  if (!profile) {
    const t = await getTranslations("Errors");
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center text-muted-foreground">
        {t("generic")}
      </div>
    );
  }
  // Google sign-ups answer the mode question first.
  if (!profile.default_mode) return redirect({ href: "/onboarding", locale: lang });
  // Landlords see how many requests wait for an answer (F6), and everybody
  // their unread messages (F7). Notifications come in F9.
  const [newRequests, unreadMessages] = await Promise.all([
    profile.default_mode === "host" ? getNewRequestCount() : Promise.resolve(0),
    getUnreadMessageCount(),
  ]);

  return (
    // grid-cols-1 is minmax(0, 1fr): without it the single phone column grew
    // to the width of the menu strip (about 700px) and every page scrolled sideways.
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-10">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <DashboardNav
          mode={profile.default_mode}
          isAdmin={isAdminProfile(profile)}
          badges={{ requestsInbox: newRequests }}
          unreadMessages={unreadMessages}
        />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
