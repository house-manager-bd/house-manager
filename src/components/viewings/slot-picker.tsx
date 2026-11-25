"use client";

import { CalendarCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { ErrorKey } from "@/lib/actions/result";
import { bookViewing } from "@/lib/actions/viewing";
import { dhakaDay, formatTime, formatVisitDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ViewingTime } from "@/types/database";
import { Button } from "@/components/ui/button";
import { FormError, FormSuccess } from "@/components/auth/form-alert";

/** Free times grouped by their Dhaka day, in order. */
function byDay(times: ViewingTime[]) {
  const days = new Map<string, ViewingTime[]>();
  for (const time of times) {
    const key = dhakaDay(time.starts_at);
    days.set(key, [...(days.get(key) ?? []), time]);
  }
  return [...days.values()];
}

/**
 * F11: the member picks a free time and books it. With a visit already
 * booked, the same step moves it. The database checks again that the time
 * is still free and at least an hour away.
 */
export function SlotPicker({
  requestId,
  free,
  moving = false,
}: {
  requestId: string;
  free: ViewingTime[];
  /** A visit is already booked; booking moves it. */
  moving?: boolean;
}) {
  const t = useTranslations("Viewing");
  const locale = useLocale();
  const router = useRouter();
  const [chosen, setChosen] = useState<ViewingTime | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const range = (time: ViewingTime) =>
    t("timeRange", { from: formatTime(time.starts_at, locale), to: formatTime(time.ends_at, locale) });

  function book() {
    if (!chosen) return;
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await bookViewing({ requestId, slotId: chosen.id });
      if (!result.ok) {
        setError(result.error);
        setChosen(null);
        router.refresh();
        return;
      }
      setDone(moving ? t("doneMoved") : t("doneBooked"));
      setChosen(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {byDay(free).map((times) => (
        <div key={times[0].id} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{formatVisitDay(times[0].starts_at, locale)}</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label={formatVisitDay(times[0].starts_at, locale)}>
            {times.map((time) => {
              const selected = chosen?.id === time.id;
              return (
                <button
                  key={time.id}
                  type="button"
                  onClick={() => setChosen(selected ? null : time)}
                  aria-pressed={selected}
                  aria-label={range(time)}
                  title={range(time)}
                  data-slot-id={time.id}
                  disabled={pending}
                  className={cn(
                    "h-9 rounded-md border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:border-primary/60 hover:bg-primary/5",
                  )}
                >
                  {formatTime(time.starts_at, locale)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {chosen && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-background p-3">
          <p className="text-sm">
            {t("chosen", { day: formatVisitDay(chosen.starts_at, locale), time: range(chosen) })}
          </p>
          <Button onClick={book} disabled={pending} className="w-fit">
            <CalendarCheck aria-hidden />
            {pending ? t("booking") : moving ? t("moveHere") : t("book")}
          </Button>
        </div>
      )}
      <FormError error={error} />
      <FormSuccess message={done} />
    </div>
  );
}
