"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { setMode } from "@/lib/actions/profile";
import type { ErrorKey } from "@/lib/actions/result";
import type { AppMode } from "@/types/database";
import { Button } from "@/components/ui/button";
import { FormError } from "./form-alert";
import { ModePicker } from "./mode-picker";

export function OnboardingForm() {
  const t = useTranslations("Onboarding");
  const tAuth = useTranslations("Auth");
  const router = useRouter();
  const [mode, setModeValue] = useState<AppMode | undefined>();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!mode) {
      setError("modeRequired");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setMode(mode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormError error={error} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{tAuth("modeQuestion")}</legend>
        <ModePicker value={mode} onChange={setModeValue} invalid={error === "modeRequired"} />
        <p className="text-xs text-muted-foreground">{tAuth("modeHint")}</p>
      </fieldset>
      <Button type="submit" size="lg" disabled={pending}>
        {t("continue")}
      </Button>
    </form>
  );
}
