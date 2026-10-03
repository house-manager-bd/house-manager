"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import type { ErrorKey } from "@/lib/actions/result";

export function FormError({ error }: { error?: ErrorKey | null }) {
  const t = useTranslations("Errors");
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <span>{t(error)}</span>
    </Alert>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="success">
      <CircleCheck aria-hidden />
      <span>{message}</span>
    </Alert>
  );
}
