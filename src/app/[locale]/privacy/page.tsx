import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { openGraphFor, pageAlternates } from "@/lib/seo";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";

/** Change this date whenever the text changes. */
const UPDATED = "2026-11-26";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const lang = locale as "bn" | "en";
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale: lang, namespace: "Privacy" }),
    getTranslations({ locale: lang, namespace: "Common" }),
  ]);
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: pageAlternates(lang, "/privacy"),
    openGraph: openGraphFor(lang, {
      title: t("title"),
      description: t("metaDescription"),
      path: "/privacy",
      siteName: tCommon("appName"),
    }),
  };
}

// F12 (SRS "other requirements"): what is collected, who sees it and how long it is kept, in both languages.
export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale as "bn" | "en");
  const t = await getTranslations("Privacy");
  return (
    <LegalPage
      title={t("title")}
      intro={t("intro")}
      note={t("note")}
      sections={t.raw("sections") as LegalSection[]}
      updated={UPDATED}
    />
  );
}
