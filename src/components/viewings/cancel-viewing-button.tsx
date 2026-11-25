"use client";

import { CalendarX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { ErrorKey } from "@/lib/actions/result";
import { cancelViewing } from "@/lib/actions/viewing";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";

/** F11: the member cancels their coming visit. Asks first; the landlord side is told. */
export function CancelViewingButton({ requestId }: { requestId: string }) {
  const t = useTranslations("Viewing");
  const router = useRouter();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    if (!window.confirm(t("cancelConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelViewing(requestId);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="outline" onClick={cancel} disabled={pending} className="w-fit">
        <CalendarX aria-hidden />
        {pending ? t("cancelling") : t("cancel")}
      </Button>
      <FormError error={error} />
    </div>
  );
}
