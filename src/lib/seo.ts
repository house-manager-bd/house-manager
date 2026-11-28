import type { Metadata } from "next";

type Lang = "bn" | "en";

/**
 * The share picture for pages without their own photo (F12): the logo, the
 * name and the promise, in the page's language. Files in public/, made with
 * Chromium so the Bangla text is shaped correctly.
 */
export function defaultShareImage(lang: Lang, alt: string) {
  return { url: `/og-${lang}.png`, width: 1200, height: 630, alt };
}

/**
 * The canonical address and the hreflang links of a page that exists in both
 * languages. path is written without the language prefix ("" for the home
 * page, "/rights", "/ads?area=10002").
 */
export function pageAlternates(lang: Lang, path: string): NonNullable<Metadata["alternates"]> {
  return {
    canonical: `/${lang}${path}`,
    languages: { bn: `/bn${path}`, en: `/en${path}`, "x-default": `/bn${path}` },
  };
}

/**
 * Open Graph values for a page. A page's openGraph replaces the layout's
 * completely, so every page passes the full set.
 */
export function openGraphFor(
  lang: Lang,
  page: {
    title: string;
    description: string;
    path: string;
    siteName: string;
    images?: NonNullable<NonNullable<Metadata["openGraph"]>["images"]>;
  },
): NonNullable<Metadata["openGraph"]> {
  return {
    title: page.title,
    description: page.description,
    url: `/${lang}${page.path}`,
    siteName: page.siteName,
    type: "website",
    locale: lang === "bn" ? "bn_BD" : "en_US",
    images: page.images ?? [defaultShareImage(lang, page.title)],
  };
}
