"use client";

import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { formatTaka } from "@/lib/format";
import type { PlaceGroup } from "@/lib/search";
import { LISTING_TYPES } from "@/lib/validation/listing";
import { EMPTY_FILTERS, parsePlace, searchHref } from "@/lib/validation/search";
import type { ListingType } from "@/types/database";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

const RENT_STEPS = [5000, 10000, 15000, 20000, 30000, 50000];

/** The home page search: area, ad type and highest rent. */
export function HomeSearch({ groups }: { groups: PlaceGroup[] }) {
  const t = useTranslations("Home");
  const tSearch = useTranslations("Search");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [place, setPlace] = useState("");
  const [type, setType] = useState("");
  const [max, setMax] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => {
      router.push(
        searchHref(EMPTY_FILTERS, {
          place: parsePlace(place),
          types: type ? [type as ListingType] : [],
          rentMax: max ? Number(max) : null,
        }),
      );
    });
  }

  const field = "flex min-w-0 flex-col gap-1 text-left";
  const label = "text-xs font-medium text-muted-foreground";

  return (
    <form
      action={`/${locale}/ads`}
      method="get"
      role="search"
      onSubmit={onSubmit}
      className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-3 shadow-sm sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end sm:p-4"
    >
      <div className={`${field} col-span-2 sm:col-span-1`}>
        <label htmlFor={`${id}-area`} className={label}>
          {tSearch("areaLabel")}
        </label>
        <NativeSelect id={`${id}-area`} name="area" value={place} onChange={(e) => setPlace(e.target.value)} className="h-11">
          <option value="">{tSearch("allAreas")}</option>
          {groups.map((group) => (
            <optgroup key={group.thana.value} label={group.label}>
              <option value={group.thana.value}>{group.thana.label}</option>
              {group.areas.map((area) => (
                <option key={area.value} value={area.value}>
                  {area.label}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
      </div>
      <div className={field}>
        <label htmlFor={`${id}-type`} className={label}>
          {tSearch("adType")}
        </label>
        <NativeSelect id={`${id}-type`} name="type" value={type} onChange={(e) => setType(e.target.value)} className="h-11">
          <option value="">{t("anyType")}</option>
          {LISTING_TYPES.map((v) => (
            <option key={v} value={v}>
              {tEnum(`listingType.${v}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className={field}>
        <label htmlFor={`${id}-max`} className={label}>
          {t("maxRent")}
        </label>
        <NativeSelect id={`${id}-max`} name="max" value={max} onChange={(e) => setMax(e.target.value)} className="h-11">
          <option value="">{t("anyRent")}</option>
          {RENT_STEPS.map((v) => (
            <option key={v} value={v}>
              {t("upTo", { amount: formatTaka(v, locale) })}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="col-span-2 h-11 sm:col-span-1">
        <Search aria-hidden />
        {tSearch("searchButton")}
      </Button>
    </form>
  );
}
