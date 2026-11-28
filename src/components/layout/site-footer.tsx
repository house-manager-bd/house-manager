import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "./logo";

export async function SiteFooter() {
  const t = await getTranslations("Footer");
  const locale = await getLocale();
  // Bangla digits on Bangla pages, without a thousands separator.
  const year = new Intl.NumberFormat(locale, { useGrouping: false }).format(
    new Date().getFullYear(),
  );
  // F12: the rights, terms and privacy pages, from every page.
  const links = [
    { href: "/rights" as const, label: t("rights") },
    { href: "/terms" as const, label: t("terms") },
    { href: "/privacy" as const, label: t("privacy") },
  ];

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Logo />
          <p>{t("tagline")}</p>
        </div>
        <nav aria-label={t("legalNav")}>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 sm:flex-col sm:items-end sm:gap-y-1.5">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="rounded-sm text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-1 border-t px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <p>{t("course")}</p>
        <p>{t("copyright", { year })}</p>
      </div>
    </footer>
  );
}
