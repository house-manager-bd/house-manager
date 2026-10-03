"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Link } from "@/i18n/navigation";
import { login } from "@/lib/actions/auth";
import type { ErrorKey } from "@/lib/actions/result";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "./form-alert";
import { FormField, fieldAria } from "./form-field";

export function LoginForm({
  next,
  initialError,
}: {
  next?: string | null;
  initialError?: ErrorKey | null;
}) {
  const t = useTranslations("Auth");
  const [serverError, setServerError] = useState<ErrorKey | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await login(values, next);
      if (result && !result.ok) setServerError(result.error);
    });
  });

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
      <FormField
        id="password"
        label={t("password")}
        error={errors.password?.message}
        labelAside={
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            {t("forgotPassword")}
          </Link>
        }
      >
        <Input
          {...fieldAria("password", errors.password?.message)}
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {t("loginButton")}
      </Button>
    </form>
  );
}
