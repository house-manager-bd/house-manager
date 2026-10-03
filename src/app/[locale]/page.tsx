import { Languages, ShieldCheck, UserRoundX } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as "bn" | "en");
  const t = await getTranslations("Home");
  const user = await getCurrentUser();

  const features = [
    { icon: UserRoundX, title: t("feature1Title"), body: t("feature1Body") },
    { icon: ShieldCheck, title: t("feature2Title"), body: t("feature2Body") },
    { icon: Languages, title: t("feature3Title"), body: t("feature3Body") },
  ];

  // F4 replaces these targets with the search page and the post-ad wizard.
  const findHref = user ? "/dashboard" : "/signup";
  const hostHref = user ? "/dashboard" : "/signup";

  return (
    <>
      <section className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:py-20">
          <span className="w-fit rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground sm:text-sm">
            {t("badge")}
          </span>
          <h1 className="max-w-3xl text-3xl leading-tight font-bold tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            {t("subtitle")}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={findHref}>{t("ctaFind")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={hostHref}>{t("ctaHost")}</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("listingsSoon")}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border bg-card p-5 shadow-sm">
            <span className="mb-3 grid size-10 place-items-center rounded-lg bg-secondary text-secondary-foreground">
              <Icon className="size-5" aria-hidden />
            </span>
            <h2 className="mb-1 font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>
    </>
  );
}
