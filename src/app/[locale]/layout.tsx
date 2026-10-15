import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

// Self-hosted fonts (no request to Google Fonts). The browser downloads only
// the subsets a page actually uses.
// Noto Sans Bengali: one variable file covers every weight, and its digits
// are easy to tell apart (Hind Siliguri's ১ looked like a comma).
import "@fontsource-variable/noto-sans-bengali";
import "@fontsource-variable/inter";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "bn" | "en", namespace: "Metadata" });
  const tCommon = await getTranslations({ locale: locale as "bn" | "en", namespace: "Common" });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    metadataBase: new URL(siteUrl),
    title: { default: t("title"), template: `%s | ${tCommon("appName")}` },
    description: t("description"),
    alternates: {
      canonical: `/${locale}`,
      languages: { bn: "/bn", en: "/en" },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      locale: locale === "bn" ? "bn_BD" : "en_US",
      type: "website",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0F766E",
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Lets pages under this layout render statically where possible.
  setRequestLocale(locale);

  return (
    <html lang={locale} className="h-full">
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
