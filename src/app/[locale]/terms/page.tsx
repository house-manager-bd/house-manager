import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { openGraphFor, pageAlternates } from "@/lib/seo";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";

/** Change this date whenever the text changes. */
const UPDATED = "2026-11-26";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  const lang = locale as "bn" | "en";
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale: lang, namespace: "Terms" }),
    getTranslations({ locale: lang, namespace: "Common" }),
  ]);
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: pageAlternates(lang, "/terms"),
    openGraph: openGraphFor(lang, {
      title: t("title"),
      description: t("metaDescription"),
      path: "/terms",
      siteName: tCommon("appName"),
    }),
  };
}

// F12 (SRS "other requirements"): the rules for using the site, in both languages.
export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  setRequestLocale(locale as "bn" | "en");
  const t = await getTranslations("Terms");
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
