import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "./logo";

export async function SiteFooter() {
  const t = await getTranslations("Footer");
  const locale = await getLocale();
  // Bangla digits on Bangla pages, without a thousands separator.
  const year = new Intl.NumberFormat(locale, { useGrouping: false }).format(
    new Date().getFullYear(),
  );

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Logo />
          <p>{t("tagline")}</p>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <p>{t("course")}</p>
          <p>{t("copyright", { year })}</p>
        </div>
      </div>
    </footer>
  );
}
