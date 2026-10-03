"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { signup } from "@/lib/actions/auth";
import type { ErrorKey } from "@/lib/actions/result";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "./form-alert";
import { FormField, fieldAria } from "./form-field";
import { ModePicker } from "./mode-picker";

export function SignupForm() {
  const t = useTranslations("Auth");
  const tErrors = useTranslations("Errors");
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signup(values);
      if (!result) return; // Redirected (email confirmation is off).
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      setSentTo(values.email);
    });
  });

  if (sentTo) {
    return (
      <Alert variant="success" className="flex-col gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <MailCheck className="size-5" aria-hidden />
          {t("checkEmailTitle")}
        </span>
        <span className="text-foreground">{t("checkEmailBody", { email: sentTo })}</span>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError error={serverError} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("modeQuestion")}</legend>
        <Controller
          control={form.control}
          name="mode"
          render={({ field }) => (
            <ModePicker value={field.value} onChange={field.onChange} invalid={!!errors.mode} />
          )}
        />
        {errors.mode?.message ? (
          <p className="text-sm text-destructive">{tErrors(errors.mode.message as ErrorKey)}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("modeHint")}</p>
        )}
      </fieldset>

      <FormField id="fullName" label={t("fullName")} error={errors.fullName?.message}>
        <Input
          {...fieldAria("fullName", errors.fullName?.message)}
          autoComplete="name"
          {...form.register("fullName")}
        />
      </FormField>
      <FormField id="email" label={t("email")} error={errors.email?.message}>
        <Input
          {...fieldAria("email", errors.email?.message)}
          type="email"
          autoComplete="email"
          inputMode="email"
          {...form.register("email")}
        />
      </FormField>
      <FormField
        id="password"
        label={t("password")}
        error={errors.password?.message}
        hint={t("passwordHint")}
      >
        <Input
          {...fieldAria("password", errors.password?.message, t("passwordHint"))}
          type="password"
          autoComplete="new-password"
          {...form.register("password")}
        />
      </FormField>
      <FormField
        id="confirmPassword"
        label={t("confirmPassword")}
        error={errors.confirmPassword?.message}
      >
        <Input
          {...fieldAria("confirmPassword", errors.confirmPassword?.message)}
          type="password"
          autoComplete="new-password"
          {...form.register("confirmPassword")}
        />
      </FormField>

      <p className="text-xs text-muted-foreground">{t("consentNote")}</p>

      <Button type="submit" size="lg" disabled={pending}>
        {t("signupButton")}
      </Button>
    </form>
  );
}
