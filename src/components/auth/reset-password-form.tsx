"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Link } from "@/i18n/navigation";
import { updatePassword } from "@/lib/actions/auth";
import type { ErrorKey } from "@/lib/actions/result";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormSuccess } from "./form-alert";
import { FormField, fieldAria } from "./form-field";

export function ResetPasswordForm() {
  const t = useTranslations("Auth");
  const tNav = useTranslations("Nav");
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      if (!result.ok) setServerError(result.error);
      else setDone(true);
    });
  });

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <FormSuccess message={t("passwordUpdated")} />
        <Button asChild size="lg">
          <Link href="/dashboard">{tNav("dashboard")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError error={serverError} />
      <FormField
        id="password"
        label={t("newPassword")}
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
      <Button type="submit" size="lg" disabled={pending}>
        {t("updatePassword")}
      </Button>
    </form>
  );
}
