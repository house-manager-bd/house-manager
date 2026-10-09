import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const STEPS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Seven-step progress bar. Steps 3 to 7 are links once a draft exists. */
export async function WizardProgress({ current, listingId }: { current: number; listingId?: string }) {
  const t = await getTranslations("Wizard");
  return (
    <nav aria-label={t("title")} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("stepOf", { current })}</p>
      <ol className="grid grid-cols-7 gap-1.5">
        {STEPS.map((step) => {
          const done = step < current;
          const active = step === current;
          const href = listingId && step >= 3 ? `/post/${listingId}?step=${step}` : null;
          const content = (
            <>
              <span
                className={cn(
                  "h-1.5 w-full rounded-full",
                  done || active ? "bg-primary" : "bg-muted",
                )}
              />
              <span
                className={cn(
                  "hidden items-center gap-1 text-xs sm:flex",
                  active ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {done && <Check className="size-3" aria-hidden />}
                {t(`steps.${step}`)}
              </span>
            </>
          );
          return (
            <li key={step} aria-current={active ? "step" : undefined}>
              {href ? (
                <Link href={href} className="flex flex-col gap-1.5 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  {content}
                  <span className="sr-only sm:hidden">{t(`steps.${step}`)}</span>
                </Link>
              ) : (
                <span className="flex flex-col gap-1.5">
                  {content}
                  <span className="sr-only sm:hidden">{t(`steps.${step}`)}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-lg font-semibold sm:hidden">{t(`steps.${current as 1}`)}</p>
    </nav>
  );
}
