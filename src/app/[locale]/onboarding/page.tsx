import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Onboarding");
  return { title: t("title"), robots: { index: false } };
}

// Shown once, to people who signed up with Google and have not answered
// the "Find a home or rent out my property" question yet.
export default async function OnboardingPage({ params }: PageProps<"/[locale]/onboarding">) {
  const { locale } = await params;
  const profile = await getCurrentProfile();
  if (profile?.default_mode) {
    redirect({ href: "/dashboard", locale: locale as "bn" | "en" });
  }

  const t = await getTranslations("Onboarding");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <OnboardingForm />
    </AuthCard>
  );
}
