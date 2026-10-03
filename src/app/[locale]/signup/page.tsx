import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("signupTitle") };
}

export default async function SignupPage() {
  const t = await getTranslations("Auth");

  return (
    <AuthCard
      title={t("signupTitle")}
      subtitle={t("signupSubtitle")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t("loginButton")}
          </Link>
        </>
      }
    >
      {/* Google users answer the mode question on the next screen. */}
      <GoogleButton />
      <OrDivider />
      <SignupForm />
    </AuthCard>
  );
}
