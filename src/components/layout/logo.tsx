import { House } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function Logo() {
  const t = useTranslations("Common");
  return (
    <Link
      href="/"
      className="flex items-center gap-2 rounded-md font-semibold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <House className="size-4.5" aria-hidden />
      </span>
      <span className="text-base sm:text-lg">{t("appName")}</span>
    </Link>
  );
}
