"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { revealNid } from "@/lib/actions/offer";
import type { ErrorKey } from "@/lib/actions/result";
import { Button } from "@/components/ui/button";

/**
 * A tenant's NID number: only the last 4 digits until "Show" is pressed.
 * The full number is decrypted on the server for the tenant and the ad's
 * landlord side (revealNid), and never kept in the page.
 */
export function NidReveal({ requestId, last4 }: { requestId: string; last4: string }) {
  const t = useTranslations("Offer");
  const tErrors = useTranslations("Errors");
  const [nid, setNid] = useState<string | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (nid) return setNid(null);
    setError(null);
    startTransition(async () => {
      const result = await revealNid(requestId);
      if (!result.ok) return setError(result.error);
      setNid(result.data.nid);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-medium tracking-wider" dir="ltr">
          {nid ?? `•••• ${last4}`}
        </span>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={toggle} disabled={pending}>
          {nid ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {nid ? t("nidHide") : pending ? t("nidLoading") : t("nidShow")}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{tErrors(error)}</p>}
    </div>
  );
}
