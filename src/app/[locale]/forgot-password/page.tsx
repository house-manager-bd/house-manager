import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("forgotTitle"), robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("Auth");
  return (
    <AuthCard
      title={t("forgotTitle")}
      subtitle={t("forgotSubtitle")}
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t("loginButton")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
