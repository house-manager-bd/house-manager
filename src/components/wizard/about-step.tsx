"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";
import { saveAboutStep } from "@/lib/actions/listing";
import type { ErrorKey } from "@/lib/actions/result";
import { aboutStepSchema, type AboutStepInput } from "@/lib/validation/listing";
import type { ListingType, PostedAs, UnitKind } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/auth/form-alert";
import { FormField, fieldAria } from "@/components/auth/form-field";
import { StepActions, wantsExit } from "./step-shell";

/** Which ad types make sense for this unit and this poster. */
function allowedTypes(unitKind: UnitKind, postedAs: PostedAs): ListingType[] {
  if (unitKind === "mess_room") return ["mess_seat"];
  if (postedAs === "tenant_sublet") return ["sublet", "room"];
  return unitKind === "room" ? ["room", "sublet"] : ["flat", "room", "sublet"];
}

export function AboutStep({
  listingId,
  defaults,
}: {
  listingId: string;
  defaults: AboutStepInput;
}) {
  const t = useTranslations("Wizard");
  const tEnum = useTranslations("Enums");
  const tErrors = useTranslations("Errors");
  const router = useRouter();
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<AboutStepInput, unknown, z.output<typeof aboutStepSchema>>({
    resolver: zodResolver(aboutStepSchema),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const err = (k: keyof AboutStepInput) => errors[k]?.message as string | undefined;
  const postedAs = defaults.postedAs;
  const types = allowedTypes(defaults.unitKind, postedAs);

  const onSubmit = form.handleSubmit((_, event) => {
    const exit = wantsExit(event);
    // The server checks the raw values again with the same schema.
    const values = form.getValues();
    setServerError(null);
    startTransition(async () => {
      const result = await saveAboutStep(listingId, values);
      if (!result.ok) return setServerError(result.error);
      router.push(exit ? "/dashboard/ads?saved=1" : `/post/${listingId}?step=4`);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormError error={serverError} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("listingType")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {types.map((type) => (
            <label
              key={type}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
            >
              <input type="radio" value={type} className="mt-0.5 size-4 accent-primary" {...form.register("listingType")} />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{tEnum(`listingType.${type}`)}</span>
                <span className="text-xs text-muted-foreground">{tEnum(`listingTypeHint.${type}`)}</span>
              </span>
            </label>
          ))}
        </div>
        {err("listingType") && <p className="text-sm text-destructive">{tErrors(err("listingType") as ErrorKey)}</p>}
      </fieldset>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("postedAs")}</span>
        <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
          <Badge variant="outline">{tEnum(`postedAs.${postedAs}`)}</Badge>
          <span className="text-xs text-muted-foreground">{t("postedAsHint")}</span>
        </div>
      </div>

      {postedAs === "caretaker" && (
        <FormField id="ownerName" label={t("ownerName")} error={err("ownerName")} hint={t("ownerNameHint")}>
          <Input {...fieldAria("ownerName", err("ownerName"), t("ownerNameHint"))} {...form.register("ownerName")} />
        </FormField>
      )}

      {postedAs === "tenant_sublet" && (
        <div className="flex flex-col gap-2">
          <CheckboxField label={t("subletConsent")} hint={t("subletConsentHint")} {...form.register("subletConsent")} />
          {err("subletConsent") && <p className="text-sm text-destructive">{tErrors(err("subletConsent") as ErrorKey)}</p>}
        </div>
      )}

      <FormField id="title" label={t("adTitle")} error={err("title")}>
        <Input {...fieldAria("title", err("title"))} placeholder={t("adTitlePlaceholder")} {...form.register("title")} />
      </FormField>

      <FormField id="description" label={t("description")} error={err("description")}>
        <Textarea {...fieldAria("description", err("description"))} rows={5} placeholder={t("descriptionPlaceholder")} {...form.register("description")} />
      </FormField>

      <FormField id="availableFrom" label={t("availableFrom")} error={err("availableFrom")}>
        <Input {...fieldAria("availableFrom", err("availableFrom"))} type="date" className="w-full sm:w-56" {...form.register("availableFrom")} />
      </FormField>

      <StepActions backHref={null} pending={pending} />
    </form>
  );
}
