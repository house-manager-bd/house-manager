"use client";

import { Check, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Opens the phone's share sheet, or copies the link on computers. */
export function ShareButton({ title }: { title: string }) {
  const t = useTranslations("AdPage");
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href.split("?")[0];
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // The person closed the share sheet.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t("copyLink"), url);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={share}>
      {copied ? <Check aria-hidden /> : <Share2 aria-hidden />}
      <span aria-live="polite">{copied ? t("linkCopied") : t("share")}</span>
    </Button>
  );
}
