"use client";

import { Handshake, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { makeOffer } from "@/lib/actions/offer";
import type { ErrorKey } from "@/lib/actions/result";
import { formatTaka } from "@/lib/format";
import { toAsciiDigits } from "@/lib/phone";
import { makeOfferSchema, OFFER_HOURS, OFFER_NOTE_MAX } from "@/lib/validation/offer";
import { addDays, dhakaToday, MOVE_IN_MAX_DAYS } from "@/lib/validation/request";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/auth/form-alert";
import { FormField, fieldAria } from "@/components/auth/form-field";

type Field = "monthlyRent" | "advance" | "startDate" | "note";

/** "১২,০০০" or "12,000" as a number, or NaN. */
function amount(value: string) {
  const text = toAsciiDigits(value).replace(/[,\s]/g, "");
  return text === "" ? Number.NaN : Number(text);
}

/**
 * The landlord side offers the place to a shortlisted member (FR26). Opens a
 * short form with the rent, the advance and the move-in date, filled in from
 * the ad and the request. The member then has 48 hours to accept. The
 * database checks everything again (make_offer), including how many places
 * are left on the ad.
 */
export function OfferForm({
  requestId,
  memberName,
  defaultRent,
  defaultAdvance,
  defaultStartDate,
  seats,
  returnTo,
  defaultOpen = false,
}: {
  requestId: string;
  memberName: string;
  defaultRent: number | null;
  defaultAdvance: number | null;
  /** The member's move-in date when it is still ahead, otherwise today. */
  defaultStartDate: string;
  /** Seats this request takes, for a mess; null for other ads. */
  seats: number | null;
  /** The request's page, to show the offer after sending it. */
  returnTo: string;
  /** Open the form at once (the "Make an offer" button on an ad's requests page links here). */
  defaultOpen?: boolean;
}) {
  const t = useTranslations("Offer");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const today = dhakaToday();
  const lastDay = addDays(today, MOVE_IN_MAX_DAYS);

  const [open, setOpen] = useState(defaultOpen);
  const [monthlyRent, setMonthlyRent] = useState(defaultRent !== null ? String(defaultRent) : "");
  const [advance, setAdvance] = useState(defaultAdvance !== null ? String(defaultAdvance) : "");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, ErrorKey>>>({});
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) formRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Handshake aria-hidden />
        {t("make")}
      </Button>
    );
  }

  const rent = amount(monthlyRent);
  const adv = amount(advance);
  const months = rent > 0 && adv >= 0 ? Math.round((adv / rent) * 10) / 10 : null;
  // Section 10 of the Premises Rent Control Act 1991 (plan section 1.8).
  const aboveLimit = months !== null && adv > rent;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const input = { requestId, monthlyRent, advance, startDate, note };
    const parsed = makeOfferSchema.safeParse(input);
    if (!parsed.success) {
      const next: Partial<Record<Field, ErrorKey>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Field;
        if (!next[key]) next[key] = issue.message as ErrorKey;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await makeOffer(input);
      if (!result.ok) {
        const fields = result.fieldErrors as Partial<Record<Field, ErrorKey>> | undefined;
        if (fields && Object.keys(fields).length) setErrors(fields);
        else if (result.error === "offerAdvanceInvalid") setErrors({ advance: result.error });
        else if (result.error === "offerRentInvalid") setErrors({ monthlyRent: result.error });
        else if (result.error === "moveInInvalid") setErrors({ startDate: result.error });
        else setError(result.error);
        return;
      }
      // The action revalidated; no router.refresh, it would cancel this navigation.
      router.replace(`${returnTo}?done=offered`, { scroll: false });
    });
  }

  const advanceHint =
    months !== null && Number.isFinite(months)
      ? t("advanceMonths", { months })
      : t("advanceHint");

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="flex w-full scroll-mt-24 flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{t("formTitle", { name: memberName })}</h2>
        <p className="text-sm text-muted-foreground">{t("formBody", { hours: OFFER_HOURS })}</p>
        {seats !== null && <p className="text-sm text-muted-foreground">{t("formSeats", { count: seats })}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${id}-rent`} label={t("rent")} error={errors.monthlyRent}>
          <Input
            {...fieldAria(`${id}-rent`, errors.monthlyRent)}
            inputMode="numeric"
            autoComplete="off"
            value={monthlyRent}
            onChange={(e) => setMonthlyRent(e.target.value)}
          />
        </FormField>
        <FormField id={`${id}-advance`} label={t("advance")} error={errors.advance} hint={advanceHint}>
          <Input
            {...fieldAria(`${id}-advance`, errors.advance, advanceHint)}
            inputMode="numeric"
            autoComplete="off"
            value={advance}
            onChange={(e) => setAdvance(e.target.value)}
          />
        </FormField>
      </div>

      {aboveLimit && (
        <Alert>
          <TriangleAlert aria-hidden />
          <span className="flex flex-col gap-0.5 text-foreground">
            <span className="font-semibold">{t("advanceWarningTitle")}</span>
            <span>{t("advanceWarning", { amount: formatTaka(rent, locale) })}</span>
          </span>
        </Alert>
      )}

      <FormField id={`${id}-start`} label={t("startDate")} error={errors.startDate}>
        <Input
          {...fieldAria(`${id}-start`, errors.startDate)}
          type="date"
          min={today}
          max={lastDay}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="max-w-48"
        />
      </FormField>

      <FormField id={`${id}-note`} label={t("note")} error={errors.note}>
        <Textarea
          {...fieldAria(`${id}-note`, errors.note)}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={OFFER_NOTE_MAX}
          rows={2}
          placeholder={t("notePlaceholder")}
        />
      </FormField>

      <p className="text-xs text-muted-foreground">{t("formShared")}</p>
      <FormError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          <Handshake aria-hidden />
          {pending ? t("sending") : t("send")}
        </Button>
      </div>
    </form>
  );
}
