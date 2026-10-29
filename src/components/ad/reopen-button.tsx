"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { reopenListing } from "@/lib/actions/listing";
import type { ErrorKey } from "@/lib/actions/result";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";

/**
 * Takes an ad that waits for review, or a rejected ad, back to a draft and
 * opens the wizard's review step (F5). Taking back an ad from review asks
 * first, because it leaves the queue.
 */
export function ReopenButton({
  listingId,
  status,
  size = "sm",
  className,
}: {
  listingId: string;
  status: "pending_review" | "rejected";
  size?: "sm" | "default";
  className?: string;
}) {
  const t = useTranslations("Ads");
  const router = useRouter();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function reopen() {
    if (status === "pending_review" && !window.confirm(t("takeBackConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const result = await reopenListing(listingId);
      if (!result.ok) return setError(result.error);
      router.push(`/post/${listingId}?step=7`);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        size={size}
        variant={status === "rejected" ? "default" : "outline"}
        onClick={reopen}
        disabled={pending}
        className={className}
      >
        <Pencil aria-hidden />
        {pending ? t("opening") : status === "rejected" ? t("fixAndResend") : t("takeBack")}
      </Button>
      <FormError error={error} />
    </div>
  );
}
