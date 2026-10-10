import { ArrowRight, Languages, MapPin, ShieldCheck, UserRoundX } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLocationTree } from "@/lib/data/locations";
import { latestListings } from "@/lib/data/search";
import { areaLabels, placeGroups } from "@/lib/search";
import { EMPTY_FILTERS, searchHref } from "@/lib/validation/search";
import { Button } from "@/components/ui/button";
import { HomeSearch } from "@/components/search/home-search";
import { ListingCard } from "@/components/search/listing-card";

/** Areas people in Mirpur search most, linked from the home page. */
const POPULAR_AREAS = [10018, 10001, 10002, 10010, 10011, 10012, 10004, 10005, 10013];
const LATEST_COUNT = 8;

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const lang = locale as "bn" | "en";
  setRequestLocale(lang);
  const [t, tSearch, user, tree, latest] = await Promise.all([
    getTranslations("Home"),
    getTranslations("Search"),
    getCurrentUser(),
    getLocationTree(),
    latestListings(LATEST_COUNT),
  ]);

  const features = [
    { icon: UserRoundX, title: t("feature1Title"), body: t("feature1Body") },
    { icon: ShieldCheck, title: t("feature2Title"), body: t("feature2Body") },
    { icon: Languages, title: t("feature3Title"), body: t("feature3Body") },
  ];

  const hostHref = user ? "/post" : "/signup";
  const groups = placeGroups(tree, lang, (thana) => tSearch("thanaAll", { thana }));
  const labels = areaLabels(tree, lang);
  const popular = POPULAR_AREAS.map((id) => tree.areas.find((a) => a.id === id)).filter((a) => a !== undefined);

  return (
    <>
      <section className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:py-16">
          <span className="w-fit rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground sm:text-sm">
            {t("badge")}
          </span>
          <div className="flex flex-col gap-3">
            <h1 className="max-w-3xl text-3xl leading-tight font-bold tracking-tight sm:text-5xl">{t("title")}</h1>
            <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">{t("subtitle")}</p>
          </div>
          <HomeSearch groups={groups} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link href="/ads" className="flex items-center gap-1 font-medium text-primary hover:underline">
              {t("browseAll")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href={hostHref} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              {t("ctaHost")}
            </Link>
          </div>
        </div>
      </section>

      {popular.length > 0 && (
        <section className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pt-10" aria-labelledby="popular-areas">
          <h2 id="popular-areas" className="text-lg font-semibold">
            {t("popularAreas")}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {popular.map((area) => (
              <li key={area.id}>
                <Link
                  href={searchHref(EMPTY_FILTERS, { place: { kind: "area", id: area.id } })}
                  className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm shadow-xs outline-none hover:border-primary hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <MapPin className="size-3.5" aria-hidden />
                  {lang === "bn" ? area.name_bn : area.name_en}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-10" aria-labelledby="latest-ads">
        <div className="flex items-end justify-between gap-3">
          <h2 id="latest-ads" className="text-lg font-semibold sm:text-xl">
            {t("latestTitle")}
          </h2>
          {latest.results.length > 0 && (
            <Link href="/ads" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              {t("seeAll")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
        {latest.results.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {latest.results.map((ad) => (
              <li key={ad.id} className="flex">
                <ListingCard ad={ad} areaLabel={labels[ad.area_id] ?? ""} className="w-full" />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
            <p className="text-muted-foreground">{latest.ok ? t("noAdsYet") : tSearch("errorBody")}</p>
            <Button asChild variant="outline">
              <Link href={hostHref}>{t("ctaHost")}</Link>
            </Button>
          </div>
        )}
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
