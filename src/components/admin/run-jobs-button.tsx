"use client";

import { TimerReset } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { runScheduledJobs } from "@/lib/actions/moderation";
import type { ErrorKey } from "@/lib/actions/result";
import type { ScheduledJobsResult } from "@/types/database";
import { Button } from "@/components/ui/button";
import { FormError, FormSuccess } from "@/components/auth/form-alert";

/** F10: runs the scheduled job now, for tests and demos. */
export function RunJobsButton() {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [result, setResult] = useState<ScheduledJobsResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await runScheduledJobs();
      if (!r.ok) return setError(r.error);
      setResult(r.data);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={run} disabled={pending} variant="outline" className="w-fit">
        <TimerReset aria-hidden />
        {pending ? t("jobsRunning") : t("jobsRun")}
      </Button>
      <FormError error={error} />
      <FormSuccess
        message={
          result &&
          `${t("jobsDone")}: ${t("jobsResult", {
            offers: result.offers_expired,
            requests: result.requests_expired,
            expired: result.ads_expired,
            reminded: result.ads_reminded,
            deleted: result.notifications_deleted,
          })}`
        }
      />
    </div>
  );
}
