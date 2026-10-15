import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { searchHref, type SearchFilters } from "@/lib/validation/search";

/** Page links that keep every filter: previous, a few numbers, next. */
export async function Pagination({
  filters,
  pageCount,
  locale,
}: {
  filters: SearchFilters;
  pageCount: number;
  locale: string;
}) {
  if (pageCount <= 1) return null;
  const t = await getTranslations("Search");
  const page = filters.page;

  // 1 … 4 5 6 … 12
  const numbers = new Set([1, pageCount, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount));
  const sorted = [...numbers].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) items.push("gap");
    items.push(n);
  });

  const box =
    "grid h-10 min-w-10 place-items-center rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

  return (
    <nav aria-label={t("pagination")} className="flex flex-col items-center gap-3">
      <ul className="flex flex-wrap items-center justify-center gap-1.5">
        <li>
          {page > 1 ? (
            <Link href={searchHref(filters, { page: page - 1 })} rel="prev" className={cn(box, "flex gap-1 hover:bg-muted")}>
              <ChevronLeft className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t("previousPage")}</span>
              <span className="sr-only sm:hidden">{t("previousPage")}</span>
            </Link>
          ) : (
            <span className={cn(box, "flex gap-1 text-muted-foreground opacity-50")} aria-hidden>
              <ChevronLeft className="size-4" />
            </span>
          )}
        </li>
        {items.map((item, i) =>
          item === "gap" ? (
            <li key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden>
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={searchHref(filters, { page: item })}
                aria-current={item === page ? "page" : undefined}
                aria-label={t("pageNumber", { page: item })}
                className={cn(
                  box,
                  item === page ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {formatNumber(item, locale)}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < pageCount ? (
            <Link href={searchHref(filters, { page: page + 1 })} rel="next" className={cn(box, "flex gap-1 hover:bg-muted")}>
              <span className="hidden sm:inline">{t("nextPage")}</span>
              <span className="sr-only sm:hidden">{t("nextPage")}</span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span className={cn(box, "flex gap-1 text-muted-foreground opacity-50")} aria-hidden>
              <ChevronRight className="size-4" />
            </span>
          )}
        </li>
      </ul>
      <p className="text-sm text-muted-foreground">{t("pageOf", { page, total: pageCount })}</p>
    </nav>
  );
}
