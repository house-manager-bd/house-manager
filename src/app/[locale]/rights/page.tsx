import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { openGraphFor, pageAlternates } from "@/lib/seo";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";

/** The official text of the Premises Rent Control Act, 1991 (in Bangla). */
const LAW_URL = "https://bdlaws.minlaw.gov.bd/act-748.html";
/** The date the summary was last checked against the law. */
const UPDATED = "2026-11-26";

export async function generateMetadata({ params }: PageProps<"/[locale]/rights">): Promise<Metadata> {
  const { locale } = await params;
  const lang = locale as "bn" | "en";
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale: lang, namespace: "Rights" }),
    getTranslations({ locale: lang, namespace: "Common" }),
  ]);
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: pageAlternates(lang, "/rights"),
    openGraph: openGraphFor(lang, {
      title: t("title"),
      description: t("metaDescription"),
      path: "/rights",
      siteName: tCommon("appName"),
    }),
  };
}

// F12 (plan: "Know your rights" page): the tenant's side of the 1991 Act, in plain words.
export default async function RightsPage({ params }: PageProps<"/[locale]/rights">) {
  const { locale } = await params;
  setRequestLocale(locale as "bn" | "en");
  const [t, tLegal] = await Promise.all([getTranslations("Rights"), getTranslations("Legal")]);
  return (
    <LegalPage
      title={t("title")}
      intro={t("intro")}
      note={t("note")}
      sections={t.raw("sections") as LegalSection[]}
      updated={UPDATED}
    >
      <p>
        <a
          href={LAW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-2"
        >
          {tLegal("lawLink")}
          <ExternalLink className="size-4" aria-hidden />
        </a>
      </p>
    </LegalPage>
  );
}
