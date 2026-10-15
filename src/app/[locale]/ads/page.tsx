import type { Metadata } from "next";
import { CircleAlert, List, Map as MapIcon, SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { getLocationTree, type LocationTree } from "@/lib/data/locations";
import { searchListings } from "@/lib/data/search";
import { areaLabels, placeAreaIds, placeGroups, placeName, placeView } from "@/lib/search";
import { cn } from "@/lib/utils";
import {
  countPanelFilters,
  EMPTY_FILTERS,
  hasAnyFilter,
  MAP_LIMIT,
  PAGE_SIZE,
  parseSearchParams,
  searchHref,
  toQueryString,
  type SearchFilters,
} from "@/lib/validation/search";
import { ActiveFilters } from "@/components/search/active-filters";
import { FilterPanel } from "@/components/search/filter-panel";
import { FilterSheet } from "@/components/search/filter-sheet";
import { ListingCard } from "@/components/search/listing-card";
import { Pagination } from "@/components/search/pagination";
import { SearchBar, type PlaceName } from "@/components/search/search-bar";
import { SearchMapLazy } from "@/components/search/search-map-lazy";
import { SortSelect } from "@/components/search/sort-select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Lang = "bn" | "en";

/** Area and type pages are worth indexing; other filter mixes are not. */
function isIndexable(f: SearchFilters) {
  return (
    f.q === null &&
    f.page === 1 &&
    f.view === "list" &&
    f.sort === "newest" &&
    f.types.length <= 1 &&
    countPanelFilters({ ...f, types: [] }) === 0
  );
}

function headingFor(t: Awaited<ReturnType<typeof getTranslations<"Search">>>, tree: LocationTree, f: SearchFilters, lang: Lang) {
  const place = placeName(tree, f.place, lang);
  if (!place) return t("title");
  return f.place?.kind === "thana" ? t("titleInThana", { place }) : t("titleIn", { place });
}

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/ads">): Promise<Metadata> {
  const { locale } = await params;
  const lang = locale as Lang;
  const [t, tree, raw] = await Promise.all([
    getTranslations({ locale: lang, namespace: "Search" }),
    getLocationTree(),
    searchParams,
  ]);
  const f = parseSearchParams(raw);
  // The canonical page keeps only the place and a single ad type.
  const canonical = { ...EMPTY_FILTERS, place: f.place, types: f.types.slice(0, 1) };
  const qs = toQueryString(canonical);
  const path = (l: Lang) => `/${l}/ads${qs ? `?${qs}` : ""}`;
  const title = headingFor(t, tree, f, lang);
  return {
    title,
    description: t("metaDescription"),
    alternates: { canonical: path(lang), languages: { bn: path("bn"), en: path("en") } },
    openGraph: { title, description: t("metaDescription"), url: path(lang), type: "website" },
    robots: isIndexable(f) ? undefined : { index: false, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/ads">) {
  const { locale } = await params;
  const lang = locale as Lang;
  const [t, tree, raw] = await Promise.all([getTranslations("Search"), getLocationTree(), searchParams]);
  const filters = parseSearchParams(raw);
  const areaIds = placeAreaIds(tree, filters.place);
  const isMap = filters.view === "map";

  const { results, total, ok } = await searchListings(
    filters,
    areaIds,
    isMap ? { limit: MAP_LIMIT, offset: 0 } : { limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE },
  );

  // An old link to a page that no longer exists (ads were rented or expired).
  if (ok && !isMap && results.length === 0 && filters.page > 1) {
    return redirect({ href: searchHref(filters, { page: 1 }), locale: lang });
  }

  const labels = areaLabels(tree, lang);
  const groups = placeGroups(tree, lang, (thana) => t("thanaAll", { thana }));
  const placeNames: PlaceName[] = [
    ...tree.areas.map((a) => ({ value: String(a.id), names: [a.name_en, a.name_bn] })),
    ...tree.thanas.map((th) => ({ value: `t${th.id}`, names: [th.name_en, th.name_bn] })),
  ];
  const placeLabel = placeName(tree, filters.place, lang);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const panelCount = countPanelFilters(filters);
  // Client parts start again from the URL whenever the search changes.
  const searchKey = toQueryString({ ...filters, page: 1 });

  const viewLink = (view: "list" | "map", Icon: typeof List, label: string) => {
    const active = filters.view === view;
    return (
      <Link
        href={searchHref(filters, { view, page: 1 })}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden />
        <span className="sr-only sm:not-sr-only">{label}</span>
      </Link>
    );
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{headingFor(t, tree, filters, lang)}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <SearchBar key={`bar-${searchKey}`} filters={filters} groups={groups} placeNames={placeNames} />

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-medium" aria-live="polite">
          {ok && t("resultCount", { count: total })}
        </p>
        {/* Phones: count and view on the first line, filters and sort below. */}
        <div className="order-last flex w-full gap-2 sm:order-none sm:w-auto">
          <FilterSheet key={`sheet-${searchKey}`} filters={filters} activeCount={panelCount} locale={lang} />
          <SortSelect filters={filters} />
        </div>
        <nav aria-label={t("viewLabel")} className="flex rounded-lg bg-muted p-0.5">
          {viewLink("list", List, t("viewList"))}
          {viewLink("map", MapIcon, t("viewMap"))}
        </nav>
      </div>

      <ActiveFilters filters={filters} placeLabel={placeLabel} locale={lang} />

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <aside
          aria-label={t("filtersTitle")}
          className="hidden rounded-xl border bg-card px-4 pt-4 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
        >
          <h2 className="mb-4 text-base font-semibold">{t("filtersTitle")}</h2>
          <FilterPanel key={`panel-${searchKey}`} filters={filters} />
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          {!ok ? (
            <Alert>
              <CircleAlert aria-hidden />
              <span className="flex flex-col gap-1">
                <span className="font-medium text-foreground">{t("errorTitle")}</span>
                <span className="text-muted-foreground">{t("errorBody")}</span>
              </span>
            </Alert>
          ) : isMap ? (
            <SearchMapLazy
              key={`map-${searchKey}`}
              filters={filters}
              areaIds={areaIds}
              initial={results}
              initialTotal={total}
              fallbackBox={placeView(tree, areaIds)}
              areaLabels={labels}
            />
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
              <span className="grid size-12 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                <SearchX className="size-6" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold">{hasAnyFilter(filters) ? t("emptyTitle") : t("noAdsTitle")}</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {hasAnyFilter(filters) ? t("emptyBody") : t("noAdsBody")}
              </p>
              {hasAnyFilter(filters) && (
                <Button asChild variant="outline">
                  <Link href={searchHref(EMPTY_FILTERS, { sort: filters.sort })}>{t("clearAll")}</Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((ad, i) => (
                  <li key={ad.id} className="flex">
                    <ListingCard ad={ad} areaLabel={labels[ad.area_id] ?? ""} priority={i < 2} className="w-full" />
                  </li>
                ))}
              </ul>
              <Pagination filters={filters} pageCount={pageCount} locale={lang} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
