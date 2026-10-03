"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { usePathname, useRouter } from "@/i18n/navigation";
import { updateProfile } from "@/lib/actions/profile";
import type { ErrorKey } from "@/lib/actions/result";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormSuccess } from "@/components/auth/form-alert";
import { FormField, fieldAria } from "@/components/auth/form-field";

function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; lang?: string }[];
}) {
  return (
    <div role="radiogroup" className="inline-flex w-full rounded-lg border bg-muted p-1 sm:w-auto">
      {options.map((o) => (
        <label
          key={o.value}
          lang={o.lang}
          className={cn(
            "flex-1 cursor-pointer rounded-md px-4 py-2 text-center text-sm transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 sm:flex-none",
            value === o.value ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function ProfileForm({
  defaultValues,
  email,
}: {
  defaultValues: ProfileInput;
  email: string;
}) {
  const t = useTranslations("Profile");
  const tNav = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues,
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfile(values);
      if (!result.ok) {
        setServerError(result.error);
        if (result.fieldErrors) {
          for (const [field, key] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof ProfileInput, { message: key });
          }
        }
        return;
      }
      form.reset(values);
      setSaved(true);
      if (values.locale !== locale) {
        router.replace(pathname, { locale: values.locale });
      } else {
        router.refresh();
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormError error={serverError} />
      {saved && <FormSuccess message={t("saved")} />}

      <FormField id="fullName" label={t("fullName")} error={errors.fullName?.message}>
        <Input
          {...fieldAria("fullName", errors.fullName?.message)}
          autoComplete="name"
          {...form.register("fullName")}
        />
      </FormField>

      <FormField id="email" label={t("email")}>
        <Input id="email" value={email} readOnly disabled className="bg-muted" />
      </FormField>

      <FormField
        id="phone"
        label={t("phone")}
        error={errors.phone?.message}
        hint={t("phoneHint")}
      >
        <Input
          {...fieldAria("phone", errors.phone?.message, t("phoneHint"))}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={t("phonePlaceholder")}
          {...form.register("phone")}
        />
      </FormField>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t("language")}</span>
        <Controller
          control={form.control}
          name="locale"
          render={({ field }) => (
            <Segmented
              name="locale"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "bn", label: "বাংলা", lang: "bn" },
                { value: "en", label: "English", lang: "en" },
              ]}
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t("mode")}</span>
        <Controller
          control={form.control}
          name="mode"
          render={({ field }) => (
            <Segmented
              name="mode"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "seek", label: tNav("modeSeek") },
                { value: "host", label: tNav("modeHost") },
              ]}
            />
          )}
        />
      </div>

      <div>
        <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
          {pending ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
