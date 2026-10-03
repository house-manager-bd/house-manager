import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="text-2xl font-semibold">{t("Errors.notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("Errors.notFoundBody")}</p>
      <Button asChild>
        <Link href="/">{t("Common.backHome")}</Link>
      </Button>
    </div>
  );
}
