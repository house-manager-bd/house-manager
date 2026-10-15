"use client";

import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { reportListing } from "@/lib/actions/moderation";
import type { ErrorKey } from "@/lib/actions/result";
import { NOTE_MAX, REPORT_REASONS } from "@/lib/validation/moderation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormError, FormSuccess } from "@/components/auth/form-alert";

type Reason = (typeof REPORT_REASONS)[number];

/**
 * "Report this ad" for logged-in members on a live ad (FR19). Opens a short
 * form in place, so it works the same on a phone. alreadyOn is the date of
 * the member's earlier report on this ad, if any.
 */
export function ReportAd({ listingId, alreadyOn }: { listingId: string; alreadyOn: string | null }) {
  const t = useTranslations("Report");
  const tEnum = useTranslations("Enums");
  const tCommon = useTranslations("Common");
  const tErrors = useTranslations("Errors");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [fieldError, setFieldError] = useState<ErrorKey | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (alreadyOn) {
    return <p className="text-sm text-muted-foreground">{t("already", { date: alreadyOn })}</p>;
  }
  if (sent) return <FormSuccess message={t("sent")} />;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        <Flag className="size-3.5" aria-hidden />
        {t("open")}
      </button>
    );
  }

  function send(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    if (!reason) return setError("choiceRequired");
    startTransition(async () => {
      const result = await reportListing({ listingId, reason, details });
      if (!result.ok) {
        if (result.fieldErrors?.details) setFieldError(result.fieldErrors.details);
        else setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  const detailsHint = reason === "other" ? t("detailsHintOther") : t("detailsHint");

  return (
    <form onSubmit={send} className="flex flex-col gap-4 rounded-lg border bg-card p-4" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{t("title")}</legend>
        <p className="mb-1 text-xs text-muted-foreground">{t("hint")}</p>
        {REPORT_REASONS.map((r) => (
          <label
            key={r}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted",
              "has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
            )}
          >
            <input
              type="radio"
              name={`${id}-reason`}
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>{tEnum(`reportReason.${r}`)}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-details`} className="text-sm font-medium">
          {t("details")}
        </label>
        <Textarea
          id={`${id}-details`}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={NOTE_MAX}
          rows={3}
          placeholder={t("detailsPlaceholder")}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={`${id}-details-help`}
        />
        <p id={`${id}-details-help`} className={cn("text-xs", fieldError ? "text-destructive" : "text-muted-foreground")}>
          {fieldError ? tErrors(fieldError) : detailsHint}
        </p>
      </div>

      <FormError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? t("sending") : t("send")}
        </Button>
      </div>
    </form>
  );
}
