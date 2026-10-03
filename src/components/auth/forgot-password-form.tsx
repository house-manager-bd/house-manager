"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { requestPasswordReset } from "@/lib/actions/auth";
import type { ErrorKey } from "@/lib/actions/result";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormSuccess } from "./form-alert";
import { FormField, fieldAria } from "./form-field";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (!result.ok) setServerError(result.error);
      else setSentTo(values.email);
    });
  });

  if (sentTo) return <FormSuccess message={t("resetLinkSent", { email: sentTo })} />;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError error={serverError} />
      <FormField id="email" label={t("email")} error={errors.email?.message}>
        <Input
          {...fieldAria("email", errors.email?.message)}
          type="email"
          autoComplete="email"
          inputMode="email"
          {...form.register("email")}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {t("sendResetLink")}
      </Button>
    </form>
  );
}
