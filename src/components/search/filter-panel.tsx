"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { toAsciiDigits } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { LISTING_TYPES, TENANT_TYPES } from "@/lib/validation/listing";
import { AMENITIES } from "@/lib/validation/property";
import {
  BEDROOM_FILTERS,
  EMPTY_FILTERS,
  GAS_FILTERS,
  RENT_MAX,
  searchHref,
  toQueryString,
  type Amenity,
  type GasFilter,
  type SearchFilters,
  type TenantType,
} from "@/lib/validation/search";
import type { ListingType } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type PanelValues = Pick<
  SearchFilters,
  "types" | "tenants" | "bedsMin" | "amenities" | "gas" | "availableBy"
> & { rentMin: string; rentMax: string };

function toValues(f: SearchFilters): PanelValues {
  return {
    types: f.types,
    tenants: f.tenants,
    rentMin: f.rentMin === null ? "" : String(f.rentMin),
    rentMax: f.rentMax === null ? "" : String(f.rentMax),
    bedsMin: f.bedsMin,
    amenities: f.amenities,
    gas: f.gas,
    availableBy: f.availableBy,
  };
}

function toRent(text: string) {
  const n = Number(toAsciiDigits(text).replace(/[,\s]/g, ""));
  return text.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : Math.min(Math.round(n), RENT_MAX);
}

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Every filter except keyword and area. Changes apply with the button, so
 * a phone does not reload the results after each tap. Keyword, area, sort
 * and view are kept. Without JavaScript it is a plain GET form.
 */
export function FilterPanel({
  filters,
  onApplied,
  className,
}: {
  filters: SearchFilters;
  /** Called after navigating, for example to close the bottom sheet. */
  onApplied?: () => void;
  className?: string;
}) {
  const t = useTranslations("Search");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<PanelValues>(() => toValues(filters));
  const set = <K extends keyof PanelValues>(key: K, value: PanelValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  // Keyword, area, sort and view travel along as hidden inputs (no-JS case).
  const kept = new URLSearchParams(
    toQueryString({ ...EMPTY_FILTERS, q: filters.q, place: filters.place, sort: filters.sort, view: filters.view }),
  );

  const next = (v: PanelValues): Partial<SearchFilters> => {
    let rentMin = toRent(v.rentMin);
    let rentMax = toRent(v.rentMax);
    if (rentMin !== null && rentMax !== null && rentMin > rentMax) [rentMin, rentMax] = [rentMax, rentMin];
    return {
      types: v.types,
      tenants: v.tenants,
      rentMin,
      rentMax,
      bedsMin: v.bedsMin,
      amenities: v.amenities,
      gas: v.gas,
      availableBy: v.availableBy,
      page: 1,
    };
  };

  const changed = toQueryString({ ...filters, ...next(values) }) !== toQueryString({ ...filters, page: 1 });

  function apply(v: PanelValues) {
    startTransition(() => {
      router.push(searchHref(filters, next(v)));
      onApplied?.();
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(values);
  }

  function clear() {
    const empty = toValues(EMPTY_FILTERS);
    setValues(empty);
    apply(empty);
  }

  const chip =
    "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors select-none hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50";

  return (
    <form
      action={`/${locale}/ads`}
      method="get"
      onSubmit={onSubmit}
      className={cn("@container flex flex-col", className)}
    >
      {[...kept.entries()].map(([key, value], i) => (
        <input key={`${key}-${i}`} type="hidden" name={key} value={value} />
      ))}

      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{t("adType")}</legend>
          <div className="flex flex-wrap gap-2">
            {LISTING_TYPES.map((type) => (
              <label key={type} className={chip}>
                <input
                  type="checkbox"
                  name="type"
                  value={type}
                  checked={values.types.includes(type)}
                  onChange={() => set("types", toggle<ListingType>(values.types, type))}
                  className="sr-only"
                />
                {tEnum(`listingType.${type}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{t("tenantType")}</legend>
          <p className="mb-1 text-xs text-muted-foreground">{t("tenantTypeHint")}</p>
          <div className="flex flex-wrap gap-2">
            {TENANT_TYPES.map((type) => (
              <label key={type} className={chip}>
                <input
                  type="checkbox"
                  name="tenant"
                  value={type}
                  checked={values.tenants.includes(type)}
                  onChange={() => set("tenants", toggle<TenantType>(values.tenants, type))}
                  className="sr-only"
                />
                {tEnum(`tenantType.${type}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{t("rent")}</legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-min`} className="text-xs text-muted-foreground">
                {t("rentMin")}
              </label>
              <Input
                id={`${id}-min`}
                name="min"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t("rentMinPlaceholder")}
                value={values.rentMin}
                onChange={(e) => set("rentMin", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-max`} className="text-xs text-muted-foreground">
                {t("rentMax")}
              </label>
              <Input
                id={`${id}-max`}
                name="max"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t("rentMaxPlaceholder")}
                value={values.rentMax}
                onChange={(e) => set("rentMax", e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("rentHint")}</p>
        </fieldset>

        <div className="grid gap-4 @xs:grid-cols-2 @xs:gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-beds`} className="text-sm font-semibold">
              {t("bedrooms")}
            </label>
            <NativeSelect
              id={`${id}-beds`}
              name="beds"
              value={values.bedsMin ?? ""}
              onChange={(e) => set("bedsMin", e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t("any")}</option>
              {BEDROOM_FILTERS.map((n) => (
                <option key={n} value={n}>
                  {t("bedsOrMore", { count: n })}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-gas`} className="text-sm font-semibold">
              {t("gas")}
            </label>
            <NativeSelect
              id={`${id}-gas`}
              name="gas"
              value={values.gas ?? ""}
              onChange={(e) => set("gas", (e.target.value || null) as GasFilter | null)}
            >
              <option value="">{t("noPreference")}</option>
              {GAS_FILTERS.map((g) => (
                <option key={g} value={g}>
                  {g === "any" ? t("gasAny") : tEnum(`gas.${g}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{t("amenities")}</legend>
          <p className="mb-1 text-xs text-muted-foreground">{t("amenitiesHint")}</p>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((a) => (
              <label key={a} className={chip}>
                <input
                  type="checkbox"
                  name="amenity"
                  value={a}
                  checked={values.amenities.includes(a)}
                  onChange={() => set("amenities", toggle<Amenity>(values.amenities, a))}
                  className="sr-only"
                />
                {tEnum(`amenity.${a}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-by`} className="text-sm font-semibold">
            {t("availableBy")}
          </label>
          <Input
            id={`${id}-by`}
            name="by"
            type="date"
            value={values.availableBy ?? ""}
            onChange={(e) => set("availableBy", e.target.value || null)}
          />
          <p className="text-xs text-muted-foreground">{t("availableByHint")}</p>
        </div>
      </div>

      <div className="sticky bottom-0 mt-6 flex gap-2 border-t bg-card pt-4 pb-4">
        <Button type="button" variant="outline" onClick={clear} disabled={pending} className="flex-1">
          {t("clearFilters")}
        </Button>
        <Button type="submit" disabled={pending} variant={changed ? "default" : "secondary"} className="flex-1">
          {pending ? t("applying") : t("applyFilters")}
        </Button>
      </div>
    </form>
  );
}
