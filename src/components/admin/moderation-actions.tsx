"use client";

import { Check, EyeOff, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { moderateListing } from "@/lib/actions/moderation";
import type { ErrorKey } from "@/lib/actions/result";
import { NOTE_MAX, type AdminListingAction } from "@/lib/validation/moderation";
import type { ListingStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormError, FormSuccess } from "@/components/auth/form-alert";

const QUICK_REASONS = ["broker", "copied", "phone", "wrong", "rented", "discriminatory"] as const;

/**
 * The admin's buttons for one ad (FR20). Which buttons show depends on the
 * status; the database checks the status again (moderate_listing).
 * - waiting for review: approve, reject with a reason
 * - live: keep (only with open reports), hide, take down with a reason
 * - hidden: restore, take down with a reason
 */
export function ModerationActions({
  listingId,
  status,
  hasOpenReports,
  isOwn,
  posterBanned,
}: {
  listingId: string;
  status: ListingStatus;
  hasOpenReports: boolean;
  isOwn: boolean;
  posterBanned: boolean;
}) {
  const t = useTranslations("Admin");
  const tErrors = useTranslations("Errors");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const id = useId();
  const [form, setForm] = useState<"reject" | "hide" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [noteError, setNoteError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState<AdminListingAction | null>(null);
  const [pending, startTransition] = useTransition();

  const canPublish = !isOwn && !posterBanned;
  const takeDown = status !== "pending_review";

  function run(action: AdminListingAction, withNote?: string) {
    setError(null);
    setNoteError(null);
    setDone(null);
    startTransition(async () => {
      const result = await moderateListing({ listingId, action, note: withNote });
      if (!result.ok) {
        if (result.fieldErrors?.note) setNoteError(result.fieldErrors.note);
        else setError(result.error);
        return;
      }
      setForm(null);
      setNote("");
      setDone(action);
      router.refresh();
    });
  }

  const buttons: React.ReactNode[] = [];
  if (status === "pending_review") {
    buttons.push(
      <Button key="approve" size="sm" onClick={() => run("approve")} disabled={pending || !canPublish}>
        <Check aria-hidden />
        {t("approve")}
      </Button>,
    );
  }
  if (status === "active" && hasOpenReports) {
    buttons.push(
      <Button key="keep" size="sm" onClick={() => run("restore")} disabled={pending || !canPublish}>
        <ShieldCheck aria-hidden />
        {t("keep")}
      </Button>,
    );
  }
  if (status === "hidden") {
    buttons.push(
      <Button key="restore" size="sm" onClick={() => run("restore")} disabled={pending || !canPublish}>
        <RotateCcw aria-hidden />
        {t("restore")}
      </Button>,
    );
  }
  if (status === "active") {
    buttons.push(
      <Button key="hide" size="sm" variant="outline" onClick={() => setForm(form === "hide" ? null : "hide")} disabled={pending}>
        <EyeOff aria-hidden />
        {t("hide")}
      </Button>,
    );
  }
  if (status === "pending_review" || status === "active" || status === "hidden") {
    buttons.push(
      <Button
        key="reject"
        size="sm"
        variant="outline"
        className="border-destructive/40 text-destructive hover:text-destructive"
        onClick={() => setForm(form === "reject" ? null : "reject")}
        disabled={pending}
      >
        <X aria-hidden />
        {takeDown ? t("takeDown") : t("reject")}
      </Button>,
    );
  }

  if (!buttons.length) {
    return done ? (
      <FormSuccess message={t(`done.${done}`)} />
    ) : (
      <p className="text-sm text-muted-foreground">{t("noActions")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {done && <FormSuccess message={t(`done.${done}`)} />}
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {isOwn && <p className="text-xs text-muted-foreground">{t("ownAdNote")}</p>}
      {posterBanned && <p className="text-xs text-muted-foreground">{t("posterBannedNote")}</p>}

      {form && (
        <form
          className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(form, note);
          }}
          noValidate
        >
          {form === "reject" && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t("quickReasons")}</span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setNote(t(`reasons.${r}`))}
                    className="rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    {t(`reasonLabels.${r}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-note`} className="text-sm font-medium">
              {form === "reject" ? t("rejectReason") : t("hideNote")}
            </label>
            <Textarea
              id={`${id}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_MAX}
              rows={3}
              aria-invalid={noteError ? true : undefined}
              aria-describedby={noteError || (form === "reject" && takeDown && hasOpenReports) ? `${id}-help` : undefined}
            />
            {noteError ? (
              <p id={`${id}-help`} className="text-sm text-destructive">
                {tErrors(noteError)}
              </p>
            ) : (
              form === "reject" &&
              takeDown &&
              hasOpenReports && (
                <p id={`${id}-help`} className="text-xs text-muted-foreground">
                  {t("takeDownHint")}
                </p>
              )
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setForm(null)} disabled={pending}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" variant={form === "reject" ? "destructive" : "default"} disabled={pending}>
              {pending
                ? t("working")
                : form === "hide"
                  ? t("confirmHide")
                  : takeDown
                    ? t("confirmTakeDown")
                    : t("confirmReject")}
            </Button>
          </div>
        </form>
      )}
      <FormError error={error} />
    </div>
  );
}
