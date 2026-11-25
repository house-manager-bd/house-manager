"use client";

import { CalendarPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import type { ErrorKey } from "@/lib/actions/result";
import { addViewingSlots } from "@/lib/actions/viewing";
import { formatNumber, formatTime, formatVisitDay } from "@/lib/format";
import {
  dhakaMoment,
  slotCount,
  slotStarts,
  VIEWING_BOOK_BEFORE_MINUTES,
  VIEWING_DEFAULT_MINUTES,
  VIEWING_MAX_PER_ADD,
  VIEWING_MINUTES,
  viewingTimeOptions,
} from "@/lib/validation/viewing";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { FormError, FormSuccess } from "@/components/auth/form-alert";
import { FormField, fieldAria } from "@/components/auth/form-field";

const TIMES = viewingTimeOptions();

/**
 * F11: the landlord side adds visit times to a live ad: a day, a from and
 * to time, and how long one visit takes. The form shows the times it will
 * add; the database checks everything again.
 */
export function AddSlotsForm({ listingId, days }: { listingId: string; days: string[] }) {
  const t = useTranslations("Viewing");
  const locale = useLocale();
  const router = useRouter();
  const [date, setDate] = useState(days[1] ?? days[0]);
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("12:00");
  const [minutes, setMinutes] = useState(VIEWING_DEFAULT_MINUTES);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // When the page opened; the server checks the real time again.
  const [openedAt] = useState(() => Date.now());

  const timeLabel = (time: string) => formatTime(dhakaMoment(date, time).toISOString(), locale);
  const dayLabel = (day: string, i: number) => {
    const name = formatVisitDay(dhakaMoment(day, "12:00").toISOString(), locale);
    return i === 0 ? t("today", { day: name }) : i === 1 ? t("tomorrow", { day: name }) : name;
  };

  const count = slotCount(from, to, minutes);
  const starts = slotStarts(date, from, to, minutes);
  const tooSoon = starts.length > 0 && starts[0].getTime() < openedAt + VIEWING_BOOK_BEFORE_MINUTES * 60_000;
  const preview =
    from >= to || count < 1
      ? { tone: "bad", text: t("previewNone") }
      : count > VIEWING_MAX_PER_ADD
        ? { tone: "bad", text: t("previewTooMany", { count: formatNumber(count, locale), max: VIEWING_MAX_PER_ADD }) }
        : tooSoon
          ? { tone: "bad", text: t("previewTooSoon") }
          : {
              tone: "good",
              text: t("preview", {
                count,
                times: starts.map((s) => formatTime(s.toISOString(), locale)).join(", "),
              }),
            };

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await addViewingSlots({ listingId, date, from, to, minutes });
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length) setFieldErrors(result.fieldErrors);
        else setError(result.error);
        return;
      }
      setDone(t("doneAdded", { count: result.data.count }));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="viewing-date" label={t("day")} error={fieldErrors.date}>
          <NativeSelect {...fieldAria("viewing-date", fieldErrors.date)} value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((day, i) => (
              <option key={day} value={day}>
                {dayLabel(day, i)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="viewing-minutes" label={t("length")}>
          <NativeSelect
            id="viewing-minutes"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {VIEWING_MINUTES.map((m) => (
              <option key={m} value={m}>
                {t("minutes", { count: m })}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="viewing-from" label={t("from")} error={fieldErrors.from}>
          <NativeSelect {...fieldAria("viewing-from", fieldErrors.from)} value={from} onChange={(e) => setFrom(e.target.value)}>
            {TIMES.slice(0, -1).map((time) => (
              <option key={time} value={time}>
                {timeLabel(time)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="viewing-to" label={t("to")} error={fieldErrors.to}>
          <NativeSelect {...fieldAria("viewing-to", fieldErrors.to)} value={to} onChange={(e) => setTo(e.target.value)}>
            {TIMES.slice(1).map((time) => (
              <option key={time} value={time}>
                {timeLabel(time)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <p
        className={preview.tone === "good" ? "text-sm text-muted-foreground" : "text-sm text-amber-800"}
        aria-live="polite"
        data-testid="viewing-preview"
      >
        {preview.text}
      </p>

      <FormError error={error} />
      <FormSuccess message={done} />
      <Button type="submit" disabled={pending || preview.tone !== "good"} className="w-fit">
        <CalendarPlus aria-hidden />
        {pending ? t("adding") : t("add")}
      </Button>
    </form>
  );
}
