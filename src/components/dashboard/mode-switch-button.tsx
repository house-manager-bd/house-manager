"use client";

import { ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { setMode } from "@/lib/actions/profile";
import type { AppMode } from "@/types/database";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ModeSwitchButton({
  mode,
  className,
  variant = "outline",
}: {
  mode: AppMode;
  className?: string;
  variant?: "outline" | "ghost" | "default";
}) {
  const t = useTranslations("Nav");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next: AppMode = mode === "host" ? "seek" : "host";

  return (
    <Button
      type="button"
      variant={variant}
      className={cn("justify-start", className)}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setMode(next);
          if (result.ok) {
            router.push("/dashboard");
            router.refresh();
          }
        })
      }
    >
      <ArrowLeftRight aria-hidden />
      {next === "host" ? t("switchToHost") : t("switchToSeek")}
    </Button>
  );
}
