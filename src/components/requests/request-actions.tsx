"use client";

import { Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { declineRequest, shortlistRequest } from "@/lib/actions/request";
import type { ErrorKey } from "@/lib/actions/result";
import { DECLINE_NOTE_MAX, DECLINE_REASONS } from "@/lib/validation/request";
import type { RequestStatus } from "@/types/database";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/auth/form-alert";

type Reason = (typeof DECLINE_REASONS)[number];

/**
 * The landlord's buttons on one request (FR22). Shortlist only for a new
 * request on a live ad; decline (with a reason the seeker sees) for new and
 * shortlisted requests. The database checks the same rules again.
 */
export function RequestActions({
  requestId,
  status,
  canShortlist,
  basePath,
  tab,
}: {
  requestId: string;
  status: RequestStatus;
  canShortlist: boolean;
  /** This ad's inbox page, to go back to after an action. */
  basePath: string;
  tab: string;
}) {
  const t = useTranslations("Inbox");
  const tEnum = useTranslations("Enums");
  const tErrors = useTranslations("Errors");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const id = useId();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<ErrorKey | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  if (status !== "pending" && status !== "shortlisted") return null;

  function shortlist() {
    setError(null);
    startTransition(async () => {
      const result = await shortlistRequest(requestId);
      if (!result.ok) return setError(result.error);
      // Straight to the Shortlisted tab, where the phone number now shows.
      // No router.refresh: it would cancel this navigation (the action revalidated).
      router.replace(`${basePath}?tab=shortlisted&done=shortlisted#r-${requestId}`, { scroll: false });
    });
  }

  function decline(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNoteError(null);
    if (!reason) return setError("choiceRequired");
    startTransition(async () => {
      const result = await declineRequest({ requestId, reason, note });
      if (!result.ok) {
        if (result.fieldErrors?.note) setNoteError(result.fieldErrors.note);
        else setError(result.error);
        return;
      }
      router.replace(`${basePath}?tab=${tab}&done=declined`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!declining && (
        <div className="flex flex-wrap items-center gap-2">
          {status === "pending" && (
            <Button size="sm" onClick={shortlist} disabled={pending || !canShortlist}>
              <Star aria-hidden />
              {pending ? t("working") : t("shortlist")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/40 text-destructive hover:text-destructive"
            onClick={() => setDeclining(true)}
            disabled={pending}
          >
            <X aria-hidden />
            {t("decline")}
          </Button>
        </div>
      )}
      {!declining && status === "pending" && canShortlist && (
        <p className="text-xs text-muted-foreground">{t("shortlistHint")}</p>
      )}

      {declining && (
        <form onSubmit={decline} className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3" noValidate>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">{t("declineTitle")}</legend>
            <p className="mb-1 text-xs text-muted-foreground">{t("declineHint")}</p>
            {DECLINE_REASONS.map((r) => (
              <label
                key={r}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-2.5 text-sm transition-colors hover:bg-muted",
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
                <span>{tEnum(`declineReason.${r}`)}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-note`} className="text-sm font-medium">
              {reason === "other" ? t("declineNoteOther") : t("declineNote")}
            </label>
            <Textarea
              id={`${id}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={DECLINE_NOTE_MAX}
              rows={2}
              placeholder={t("declineNotePlaceholder")}
              aria-invalid={noteError ? true : undefined}
              aria-describedby={noteError ? `${id}-note-error` : undefined}
            />
            {noteError && (
              <p id={`${id}-note-error`} className="text-sm text-destructive">
                {tErrors(noteError)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setDeclining(false)} disabled={pending}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" variant="destructive" disabled={pending}>
              {pending ? t("working") : t("confirmDecline")}
            </Button>
          </div>
        </form>
      )}
      <FormError error={error} />
    </div>
  );
}
