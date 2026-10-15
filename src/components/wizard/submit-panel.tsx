"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteDraft, submitListing } from "@/lib/actions/listing";
import type { ErrorKey } from "@/lib/actions/result";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";

/**
 * Publish button at the end of the wizard (F5):
 * - "first": a level 0 member's ad always goes to the review queue.
 * - "again": an ad that was rejected goes to review once more (the alert at
 *   the top of the wizard says why).
 * - "normal": a trusted member's ad usually goes live, unless a check flags it.
 */
export function SubmitPanel({
  listingId,
  canSubmit,
  review,
}: {
  listingId: string;
  canSubmit: boolean;
  review: "first" | "again" | "normal";
}) {
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
      router.push(
        result.data.status === "active" ? `/ads/${listingId}?published=1` : `/ads/${listingId}?submitted=review`,
      );
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
      {review !== "again" && (
        <p className="text-sm text-muted-foreground">{review === "first" ? t("firstAdNote") : t("trustedNote")}</p>
      )}
      <FormError error={error} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href={`/post/${listingId}?step=6`}>{t("back")}</Link>
          </Button>
          <Button variant="ghost" onClick={remove} disabled={pending} className="text-destructive hover:text-destructive">
            <Trash2 aria-hidden />
            {t("deleteDraft")}
          </Button>
        </div>
        <Button size="lg" onClick={publish} disabled={pending || !canSubmit}>
          {pending
            ? review === "normal"
              ? t("submitting")
              : t("submittingReview")
            : review === "normal"
              ? t("submit")
              : t("submitReview")}
        </Button>
      </div>
    </div>
  );
}
