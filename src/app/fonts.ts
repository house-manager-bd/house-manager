import localFont from "next/font/local";

/**
 * F12: the Bangla letters of Noto Sans Bengali, through next/font so the
 * file is preloaded with the page. Without the preload, Bangla pages first
 * drew their text in a fallback font and then jumped when this file
 * arrived (Lighthouse measured a layout shift of 0.27 on the home page).
 * Same file and same letters as before; the Latin part of the font still
 * comes from @fontsource (imported in the layout), and nothing is fetched
 * from Google.
 */
export const notoSansBengali = localFont({
  src: "../../node_modules/@fontsource-variable/noto-sans-bengali/files/noto-sans-bengali-bengali-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-noto-bengali",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0951-0952,U+0964-0965,U+0980-09FE,U+1CD0,U+1CD2,U+1CD5-1CD6,U+1CD8,U+1CE1,U+1CEA,U+1CED,U+1CF2,U+1CF5-1CF7,U+200C-200D,U+20B9,U+25CC,U+A8F1",
    },
  ],
});
