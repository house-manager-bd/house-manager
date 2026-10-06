"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";
import { saveTenantsStep } from "@/lib/actions/listing";
import type { ErrorKey } from "@/lib/actions/result";
import { TENANT_TYPES, tenantsStepSchema, type TenantsStepInput } from "@/lib/validation/listing";
import { Alert } from "@/components/ui/alert";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/auth/form-alert";
import { FormField, fieldAria } from "@/components/auth/form-field";
import { StepActions, wantsExit } from "./step-shell";

export function TenantsStep({
  listingId,
  defaults,
}: {
  listingId: string;
  defaults: TenantsStepInput;
}) {
  const t = useTranslations("Wizard");
  const tEnum = useTranslations("Enums");
  const tErrors = useTranslations("Errors");
  const router = useRouter();
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<TenantsStepInput, unknown, z.output<typeof tenantsStepSchema>>({
    resolver: zodResolver(tenantsStepSchema),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const err = (k: keyof TenantsStepInput) => errors[k]?.message as string | undefined;
  const isMess = defaults.listingType === "mess_seat";

  const onSubmit = form.handleSubmit((_, event) => {
    const exit = wantsExit(event);
    // The server checks the raw values again with the same schema.
    const values = form.getValues();
    setServerError(null);
    startTransition(async () => {
      const result = await saveTenantsStep(listingId, values);
      if (!result.ok) return setServerError(result.error);
      router.push(exit ? "/dashboard/ads?saved=1" : `/post/${listingId}?step=6`);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormError error={serverError} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("tenantTypes")}</legend>
        <p className="mb-2 text-xs text-muted-foreground">{t("tenantTypesHint")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TENANT_TYPES.map((type) => (
            <CheckboxField key={type} value={type} label={tEnum(`tenantType.${type}`)} {...form.register("tenantTypes")} />
          ))}
        </div>
        {err("tenantTypes") && <p className="text-sm text-destructive">{tErrors(err("tenantTypes") as ErrorKey)}</p>}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        {isMess ? (
          <FormField
            id="openSlots"
            label={t("openSlots")}
            error={err("openSlots")}
            hint={t("openSlotsHint", { capacity: defaults.capacity })}
          >
            <Input {...fieldAria("openSlots", err("openSlots"))} inputMode="numeric" {...form.register("openSlots")} />
          </FormField>
        ) : (
          <FormField id="maxOccupants" label={t("maxOccupants")} error={err("maxOccupants")}>
            <Input {...fieldAria("maxOccupants", err("maxOccupants"))} inputMode="numeric" {...form.register("maxOccupants")} />
          </FormField>
        )}
      </div>

      <FormField id="extraRules" label={t("extraRules")} error={err("extraRules")} hint={t("extraRulesHint")}>
        <Textarea {...fieldAria("extraRules", err("extraRules"), t("extraRulesHint"))} rows={3} {...form.register("extraRules")} />
      </FormField>

      <CheckboxField label={t("agreementRequired")} {...form.register("agreementRequired")} />
      <Alert>
        <Info aria-hidden />
        <span className="text-muted-foreground">{t("dmpNote")}</span>
      </Alert>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="contactPhone" label={t("contactPhone")} error={err("contactPhone")} hint={t("contactPhoneHint")}>
          <Input {...fieldAria("contactPhone", err("contactPhone"), t("contactPhoneHint"))} type="tel" inputMode="tel" placeholder="01XXXXXXXXX" {...form.register("contactPhone")} />
        </FormField>
        <FormField id="whatsapp" label={t("whatsapp")} error={err("whatsapp")} hint={t("whatsappHint")}>
          <Input {...fieldAria("whatsapp", err("whatsapp"), t("whatsappHint"))} type="tel" inputMode="tel" placeholder="01XXXXXXXXX" {...form.register("whatsapp")} />
        </FormField>
      </div>

      <StepActions backHref={`/post/${listingId}?step=4`} pending={pending} />
    </form>
  );
}
