"use client";

import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { withdrawRequest } from "@/lib/actions/request";
import type { ErrorKey } from "@/lib/actions/result";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";

/** The seeker withdraws an open request (FR24). Asks first. */
export function WithdrawButton({ requestId }: { requestId: string }) {
  const t = useTranslations("Requests");
  const router = useRouter();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function withdraw() {
    if (!window.confirm(t("withdrawConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawRequest(requestId);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="outline" onClick={withdraw} disabled={pending}>
        <Undo2 aria-hidden />
        {pending ? t("withdrawing") : t("withdraw")}
      </Button>
      <FormError error={error} />
    </div>
  );
}
