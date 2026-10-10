"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import type { SearchFilters } from "@/lib/validation/search";
import { Button } from "@/components/ui/button";
import { FilterPanel } from "./filter-panel";

/**
 * Phones and tablets: a "Filters" button that opens the filter panel as a
 * bottom sheet (design system, PROJECT_STATUS.md). Large screens show the
 * panel beside the results instead.
 */
export function FilterSheet({
  filters,
  activeCount,
  locale,
}: {
  filters: SearchFilters;
  activeCount: number;
  locale: string;
}) {
  const t = useTranslations("Search");
  const dialogRef = useRef<HTMLDialogElement>(null);
  // The panel mounts only while the sheet is open, so it always starts
  // from the filters in the URL.
  const [open, setOpen] = useState(false);

  const show = () => {
    setOpen(true);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  return (
    <>
      <Button type="button" variant="outline" onClick={show} className="lg:hidden" aria-haspopup="dialog">
        <SlidersHorizontal aria-hidden />
        {t("filtersButton")}
        {activeCount > 0 && (
          <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
            {formatNumber(activeCount, locale)}
          </span>
        )}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="filter-sheet-title"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // A tap on the dimmed backdrop closes the sheet.
          if (e.target === e.currentTarget) close();
        }}
        className="m-0 mt-auto max-h-[88dvh] w-full max-w-none rounded-t-2xl bg-background p-0 text-foreground backdrop:bg-black/50 sm:mx-auto sm:max-w-lg"
      >
        <div className="flex max-h-[88dvh] flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 id="filter-sheet-title" className="text-lg font-semibold">
              {t("filtersTitle")}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={t("close")}
              className="grid size-10 place-items-center rounded-full outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-4 pt-4">
            {open && <FilterPanel filters={filters} onApplied={close} />}
          </div>
        </div>
      </dialog>
    </>
  );
}
