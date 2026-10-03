import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ErrorKey } from "@/lib/actions/result";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import messages from "../../../../messages/en.json";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("loginTitle"), robots: { index: false } };
}

function asErrorKey(value: string | string[] | undefined): ErrorKey | null {
  return typeof value === "string" && value in messages.Errors ? (value as ErrorKey) : null;
}

export default async function LoginPage({ searchParams }: PageProps<"/[locale]/login">) {
  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : null;
  const t = await getTranslations("Auth");

  return (
    <AuthCard
      title={t("loginTitle")}
      subtitle={t("loginSubtitle")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            {t("signupButton")}
          </Link>
        </>
      }
    >
      <GoogleButton next={next} />
      <OrDivider />
      <LoginForm next={next} initialError={asErrorKey(query.error)} />
    </AuthCard>
  );
}
