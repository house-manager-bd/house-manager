"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setListingSaved } from "@/lib/actions/saved";
import type { ErrorKey } from "@/lib/actions/result";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * F10: the heart that saves an ad for a member. "overlay" sits on a search
 * card's photo (outside the card's link); "button" is a labelled button on
 * the ad page and the saved ads page. The change shows at once and goes back
 * if the server refuses it (for example the 200 limit).
 */
export function SaveButton({
  listingId,
  initialSaved,
  variant = "button",
  className,
}: {
  listingId: string;
  initialSaved: boolean;
  variant?: "overlay" | "button";
  className?: string;
}) {
  const t = useTranslations("Saved");
  const tErrors = useTranslations("Errors");
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !saved;
    setSaved(next);
    setError(null);
    startTransition(async () => {
      const result = await setListingSaved(listingId, next);
      if (!result.ok) {
        setSaved(!next);
        setError(result.error);
        return;
      }
      setSaved(result.data.saved);
    });
  }

  const label = saved ? t("unsaveAria") : t("saveAria");
  const icon = <Heart className={cn("size-4", saved && "fill-current")} aria-hidden />;

  if (variant === "overlay") {
    return (
      <span className={cn("flex flex-col items-end gap-1", className)}>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={saved}
          aria-label={label}
          title={label}
          className={cn(
            "grid size-9 place-items-center rounded-full bg-background/90 shadow-sm backdrop-blur transition-colors outline-none hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50",
            saved ? "text-destructive" : "text-foreground",
          )}
        >
          {icon}
        </button>
        {error && (
          <span role="alert" className="max-w-48 rounded-md bg-background/95 px-2 py-1 text-xs text-destructive shadow-sm">
            {tErrors(error)}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn("flex flex-col gap-1", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        aria-label={label}
        className={saved ? "text-destructive hover:text-destructive" : undefined}
      >
        {icon}
        {saved ? t("saved") : t("save")}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {tErrors(error)}
        </span>
      )}
    </span>
  );
}
