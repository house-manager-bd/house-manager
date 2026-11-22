"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setEmailNotifications } from "@/lib/actions/notification";
import { CheckboxField } from "@/components/ui/checkbox-field";

/** Notification emails on or off (F9). Saves as soon as the box changes. */
export function EmailSettingsForm({ enabled: initial }: { enabled: boolean }) {
  const t = useTranslations("Notifications");
  const tErrors = useTranslations("Errors");
  const [enabled, setEnabled] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setStatus("idle");
    startTransition(async () => {
      const result = await setEmailNotifications(next);
      if (result.ok) {
        setStatus("saved");
      } else {
        setEnabled(previous);
        setStatus("error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <CheckboxField
        name="email_enabled"
        checked={enabled}
        disabled={pending}
        onChange={(e) => change(e.target.checked)}
        label={t("emailToggle")}
        hint={enabled ? t("emailOn") : t("emailOff")}
      />
      <p className="min-h-5 text-sm" role="status" aria-live="polite">
        {status === "saved" && <span className="text-primary">{t("emailSaved")}</span>}
        {status === "error" && <span className="text-destructive">{tErrors("generic")}</span>}
      </p>
    </div>
  );
}
