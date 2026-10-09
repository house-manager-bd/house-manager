"use client";

import { useTranslations } from "next-intl";
import { useId, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { SEARCH_SORTS, searchHref, type SearchFilters, type SearchSort } from "@/lib/validation/search";
import { NativeSelect } from "@/components/ui/native-select";

/** Newest, or rent low to high, or rent high to low. Applies at once. */
export function SortSelect({ filters }: { filters: SearchFilters }) {
  const t = useTranslations("Search");
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();

  return (
    <div className="min-w-0 flex-1 sm:flex-none">
      <label htmlFor={id} className="sr-only">
        {t("sortLabel")}
      </label>
      <NativeSelect
        id={id}
        value={filters.sort}
        disabled={pending}
        onChange={(e) =>
          startTransition(() => router.push(searchHref(filters, { sort: e.target.value as SearchSort, page: 1 })))
        }
        className="h-10 bg-background sm:w-auto sm:min-w-44"
      >
        {SEARCH_SORTS.map((s) => (
          <option key={s} value={s}>
            {t(`sort.${s}`)}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
