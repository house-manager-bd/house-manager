"use client";

import { Ban, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { setUserBan } from "@/lib/actions/moderation";
import type { ErrorKey } from "@/lib/actions/result";
import { NOTE_MAX } from "@/lib/validation/moderation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormError, FormSuccess } from "@/components/auth/form-alert";

/** Ban (with a reason) or lift the ban, on the admin Members page (FR20). */
export function BanControl({ userId, banned }: { userId: string; banned: boolean }) {
  const t = useTranslations("Admin");
  const tErrors = useTranslations("Errors");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [noteError, setNoteError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(nextBanned: boolean) {
    setError(null);
    setNoteError(null);
    setDone(null);
    startTransition(async () => {
      const result = await setUserBan({ userId, banned: nextBanned, note });
      if (!result.ok) {
        if (result.fieldErrors?.note) setNoteError(result.fieldErrors.note);
        else setError(result.error);
        return;
      }
      setOpen(false);
      setNote("");
      setDone(nextBanned ? t("bannedDone") : t("unbannedDone"));
      router.refresh();
    });
  }

  if (banned) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          disabled={pending}
          onClick={() => window.confirm(t("unbanConfirm")) && save(false)}
        >
          <Undo2 aria-hidden />
          {t("unban")}
        </Button>
        <FormSuccess message={done} />
        <FormError error={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!open && (
        <Button
          size="sm"
          variant="outline"
          className="w-fit border-destructive/40 text-destructive hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Ban aria-hidden />
          {t("ban")}
        </Button>
      )}
      {open && (
        <form
          className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            save(true);
          }}
          noValidate
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-reason`} className="text-sm font-medium">
              {t("banReason")}
            </label>
            <Textarea
              id={`${id}-reason`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_MAX}
              rows={2}
              aria-invalid={noteError ? true : undefined}
              aria-describedby={`${id}-help`}
            />
            <p id={`${id}-help`} className={noteError ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
              {noteError ? tErrors(noteError) : t("banHint")}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" variant="destructive" disabled={pending}>
              {pending ? t("working") : t("confirmBan")}
            </Button>
          </div>
        </form>
      )}
      <FormSuccess message={done} />
      <FormError error={error} />
    </div>
  );
}
