"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import type { ErrorKey } from "@/lib/actions/result";

/** Label, control, hint and translated error, wired up for screen readers. */
export function FormField({
  id,
  label,
  error,
  hint,
  children,
  labelAside,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  labelAside?: ReactNode;
}) {
  const t = useTranslations("Errors");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {t(error as ErrorKey)}
        </p>
      )}
    </div>
  );
}

/** aria props for an input inside FormField. */
export function fieldAria(id: string, error?: string, hint?: string) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}
