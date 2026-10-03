import { redirect } from "@/i18n/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";

export default async function DashboardLayout({
  children,
  params,
}: LayoutProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  const lang = locale as "bn" | "en";
  const profile = await getCurrentProfile();

  // The proxy already sends visitors to /login. This is a second guard.
  if (!profile) return redirect({ href: "/login", locale: lang });
  // Google sign-ups answer the mode question first.
  if (!profile.default_mode) return redirect({ href: "/onboarding", locale: lang });

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr] lg:py-10">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <DashboardNav mode={profile.default_mode} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
