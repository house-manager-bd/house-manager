"use client";

import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { PlaceGroup } from "@/lib/search";
import {
  cleanKeyword,
  compactText,
  parsePlace,
  placeParam,
  searchHref,
  toQueryString,
  type SearchFilters,
} from "@/lib/validation/search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export type PlaceName = { value: string; names: string[] };

/**
 * Keyword and area. Submitting keeps the other filters and goes back to
 * page 1. Without JavaScript it is a plain GET form with the other filters
 * as hidden fields.
 */
export function SearchBar({
  filters,
  groups,
  placeNames,
}: {
  filters: SearchFilters;
  groups: PlaceGroup[];
  /** Every area and thana with its Bangla and English names. */
  placeNames: PlaceName[];
}) {
  const t = useTranslations("Search");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q ?? "");
  const [place, setPlace] = useState(placeParam(filters.place) ?? "");

  // Fields this form does not own travel along as hidden inputs (no-JS case).
  const kept = new URLSearchParams(toQueryString({ ...filters, q: null, place: null, page: 1 }));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let keyword = cleanKeyword(q);
    let nextPlace = parsePlace(place);
    // Typing an area name ("Mirpur 10", "মিরপুর ১০") picks that area instead.
    if (keyword && !nextPlace) {
      const typed = compactText(keyword);
      const match = placeNames.find((p) => p.names.some((n) => compactText(n) === typed));
      if (match) {
        nextPlace = parsePlace(match.value);
        keyword = null;
        setQ("");
        setPlace(match.value);
      }
    }
    startTransition(() => {
      router.push(searchHref(filters, { q: keyword, place: nextPlace, page: 1 }));
    });
  }

  return (
    <form
      action={`/${locale}/ads`}
      method="get"
      role="search"
      onSubmit={onSubmit}
      className="flex flex-col gap-2 sm:flex-row"
    >
      {[...kept.entries()].map(([key, value], i) => (
        <input key={`${key}-${i}`} type="hidden" name={key} value={value} />
      ))}
      <div className="relative flex-1">
        <label htmlFor={`${id}-q`} className="sr-only">
          {t("keywordLabel")}
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={`${id}-q`}
          name="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("keywordPlaceholder")}
          maxLength={80}
          enterKeyHint="search"
          className="h-11 bg-background pl-9"
        />
      </div>
      <div className="sm:w-60">
        <label htmlFor={`${id}-area`} className="sr-only">
          {t("areaLabel")}
        </label>
        <NativeSelect
          id={`${id}-area`}
          name="area"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          className="h-11 bg-background"
        >
          <option value="">{t("allAreas")}</option>
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
      <Button type="submit" size="lg" disabled={pending} className="h-11">
        <Search aria-hidden />
        {t("searchButton")}
      </Button>
    </form>
  );
}
