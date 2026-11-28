import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { defaultShareImage } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { notoSansBengali } from "../fonts";

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
  const lang = locale as "bn" | "en";
  const t = await getTranslations({ locale: lang, namespace: "Metadata" });
  const tCommon = await getTranslations({ locale: lang, namespace: "Common" });

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("title"), template: `%s | ${tCommon("appName")}` },
    description: t("description"),
    applicationName: tCommon("appName"),
    // No canonical here: every indexable page sets its own (F12). A canonical
    // in the layout made pages such as /en/signup point to the home page.
    openGraph: {
      title: t("title"),
      description: t("description"),
      siteName: tCommon("appName"),
      locale: lang === "bn" ? "bn_BD" : "en_US",
      type: "website",
      images: [defaultShareImage(lang, t("title"))],
    },
    twitter: { card: "summary_large_image" },
    // Google Search Console's HTML tag check, if the team sets it on Vercel (SETUP.md 8.10).
    verification: process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : undefined,
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
  const tNav = await getTranslations("Nav");

  return (
    <html lang={locale} className={`h-full ${notoSansBengali.variable}`}>
      <body className="flex min-h-full flex-col">
        {/* F12: photos load from Supabase Storage. Opening that connection
            early saves a few hundred milliseconds on phones before the first
            photo. React moves this tag into <head>. */}
        <link rel="preconnect" href={SUPABASE_URL} />
        <NextIntlClientProvider>
          {/* F12: keyboard users can jump past the header. Visible only when focused. */}
          <a
            href="#main"
            className="sr-only rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
          >
            {tNav("skipToContent")}
          </a>
          <SiteHeader />
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
