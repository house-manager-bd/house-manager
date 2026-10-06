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

/** Bottom buttons shared by steps 3 to 5. */
export function StepActions({
  backHref,
  pending,
}: {
  backHref: string | null;
  pending: boolean;
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
          {t("saveDraftExit")}
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {t("saveAndNext")}
        </Button>
      </div>
    </div>
  );
}
