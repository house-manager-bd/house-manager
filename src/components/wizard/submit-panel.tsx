"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteDraft, submitListing } from "@/lib/actions/listing";
import type { ErrorKey } from "@/lib/actions/result";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";

export function SubmitPanel({ listingId, canSubmit }: { listingId: string; canSubmit: boolean }) {
  const t = useTranslations("Wizard");
  const router = useRouter();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function publish() {
    setError(null);
    startTransition(async () => {
      const result = await submitListing(listingId);
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      router.push("/dashboard/ads?published=1");
    });
  }

  function remove() {
    if (!window.confirm(t("deleteDraftConfirm"))) return;
    startTransition(async () => {
      const result = await deleteDraft(listingId);
      if (!result.ok) return setError(result.error);
      router.push("/dashboard/ads");
    });
  }

  return (
    <div className="flex flex-col gap-4 border-t pt-5">
      <FormError error={error} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href={`/post/${listingId}?step=5`}>{t("back")}</Link>
          </Button>
          <Button variant="ghost" onClick={remove} disabled={pending} className="text-destructive hover:text-destructive">
            <Trash2 aria-hidden />
            {t("deleteDraft")}
          </Button>
        </div>
        <Button size="lg" onClick={publish} disabled={pending || !canSubmit}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </div>
  );
}
