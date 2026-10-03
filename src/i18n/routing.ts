import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["bn", "en"],
  defaultLocale: "bn",
  localePrefix: "always",
  // Remember the chosen language for a year (FR5).
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});

export type AppLocale = (typeof routing.locales)[number];
