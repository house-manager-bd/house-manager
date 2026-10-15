import { X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDate, formatTaka } from "@/lib/format";
import { EMPTY_FILTERS, hasAnyFilter, searchHref, type SearchFilters } from "@/lib/validation/search";

/** The filters in use as chips. Each chip is a link that removes it. */
export async function ActiveFilters({
  filters,
  placeLabel,
  locale,
}: {
  filters: SearchFilters;
  placeLabel: string | null;
  locale: string;
}) {
  if (!hasAnyFilter(filters)) return null;
  const [t, tEnum] = await Promise.all([getTranslations("Search"), getTranslations("Enums")]);
  const f = filters;

  const chips: { key: string; label: string; href: string }[] = [];
  if (f.q) chips.push({ key: "q", label: t("chipKeyword", { q: f.q }), href: searchHref(f, { q: null, page: 1 }) });
  if (f.place && placeLabel) chips.push({ key: "place", label: placeLabel, href: searchHref(f, { place: null, page: 1 }) });
  for (const type of f.types) {
    chips.push({
      key: `type-${type}`,
      label: tEnum(`listingType.${type}`),
      href: searchHref(f, { types: f.types.filter((x) => x !== type), page: 1 }),
    });
  }
  for (const tenant of f.tenants) {
    chips.push({
      key: `tenant-${tenant}`,
      label: tEnum(`tenantType.${tenant}`),
      href: searchHref(f, { tenants: f.tenants.filter((x) => x !== tenant), page: 1 }),
    });
  }
  if (f.rentMin !== null || f.rentMax !== null) {
    const min = f.rentMin !== null ? formatTaka(f.rentMin, locale) : null;
    const max = f.rentMax !== null ? formatTaka(f.rentMax, locale) : null;
    chips.push({
      key: "rent",
      label: min && max ? t("chipRentRange", { min, max }) : min ? t("chipRentMin", { min }) : t("chipRentMax", { max: max! }),
      href: searchHref(f, { rentMin: null, rentMax: null, page: 1 }),
    });
  }
  if (f.bedsMin !== null) {
    chips.push({ key: "beds", label: t("chipBeds", { count: f.bedsMin }), href: searchHref(f, { bedsMin: null, page: 1 }) });
  }
  for (const amenity of f.amenities) {
    chips.push({
      key: `amenity-${amenity}`,
      label: tEnum(`amenity.${amenity}`),
      href: searchHref(f, { amenities: f.amenities.filter((x) => x !== amenity), page: 1 }),
    });
  }
  if (f.gas) {
    chips.push({
      key: "gas",
      label: f.gas === "any" ? t("gasAny") : tEnum(`gas.${f.gas}`),
      href: searchHref(f, { gas: null, page: 1 }),
    });
  }
  if (f.availableBy) {
    chips.push({
      key: "by",
      label: t("chipAvailableBy", { date: formatDate(f.availableBy, locale) }),
      href: searchHref(f, { availableBy: null, page: 1 }),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ul className="contents">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              aria-label={t("removeFilter", { filter: chip.label })}
              className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 py-1 pr-2 pl-3 text-sm text-primary outline-none hover:bg-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="max-w-56 truncate">{chip.label}</span>
              <X className="size-3.5 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={searchHref(EMPTY_FILTERS, { sort: f.sort, view: f.view })}
        className="px-1 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {t("clearAll")}
      </Link>
    </div>
  );
}
