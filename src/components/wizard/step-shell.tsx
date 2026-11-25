"use client";
import type React from "react";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/** True when the "Save draft and exit" button submitted the form. */
export function wantsExit(event?: React.BaseSyntheticEvent) {
  const submitter = (event?.nativeEvent as SubmitEvent | undefined)?.submitter;
  return submitter?.getAttribute("value") === "exit";
}

/**
 * Where a step goes after saving. A live ad (F10) that a change sent back to
 * review leaves the wizard for My ads, which says why.
 */
export function afterSaveHref(
  listingId: string,
  nextStep: number,
  exit: boolean,
  live: boolean,
  status?: string,
) {
  if (status === "pending_review") return "/dashboard/ads?review=1";
  if (exit) return live ? "/dashboard/ads?edited=1" : "/dashboard/ads?saved=1";
  return `/post/${listingId}?step=${nextStep}`;
}

/** Bottom buttons shared by steps 3 to 6. On a live ad (F10) nothing is a draft. */
export function StepActions({
  backHref,
  pending,
  live = false,
}: {
  backHref: string | null;
  pending: boolean;
  live?: boolean;
}) {
  const t = useTranslations("Wizard");
  return (
    <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      {backHref ? (
        <Button asChild variant="ghost">
          <Link href={backHref}>{t("back")}</Link>
        </Button>
      ) : (
        <span />
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Button type="submit" name="intent" value="exit" variant="outline" disabled={pending}>
          {live ? t("saveExit") : t("saveDraftExit")}
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {t("saveAndNext")}
        </Button>
      </div>
    </div>
  );
}
