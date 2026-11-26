"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { ErrorKey } from "@/lib/actions/result";
import { removeViewingSlot } from "@/lib/actions/viewing";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";

/**
 * F11: the landlord side removes a visit time that has not started. A
 * booked time asks first, because its member is told and has to pick again.
 */
export function RemoveSlotButton({ slotId, bookedBy }: { slotId: string; bookedBy: string | null }) {
  const t = useTranslations("Viewing");
  const router = useRouter();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (bookedBy !== null && !window.confirm(t("removeBookedConfirm", { name: bookedBy }))) return;
    setError(null);
    startTransition(async () => {
      const result = await removeViewingSlot(slotId);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={remove}
        disabled={pending}
        className="text-muted-foreground hover:text-destructive"
        data-remove-slot={slotId}
      >
        <Trash2 aria-hidden />
        {pending ? t("removing") : t("remove")}
      </Button>
      <FormError error={error} />
    </div>
  );
}
