import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { getCurrentProfile, getCurrentUser, isAdminProfile } from "@/lib/auth";
import { getAdminCounts } from "@/lib/data/admin";
import { AdminNav } from "@/components/admin/admin-nav";

// Admin pages (F5): review queue, reports and members. Only team members with
// profiles.is_admin = true get here; everyone else sees "page not found", so
// the pages do not reveal that they exist. The database checks the same rule
// in every admin function and policy.
export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);

  // The proxy already sends visitors to /login. This is a second guard.
  if (!user) return redirect({ href: "/login", locale: locale as "bn" | "en" });
  if (!isAdminProfile(profile)) notFound();

  const counts = await getAdminCounts();

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-10">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <AdminNav counts={counts} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
