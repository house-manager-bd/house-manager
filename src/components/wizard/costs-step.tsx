"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";
import { saveCostsStep } from "@/lib/actions/listing";
import type { ErrorKey } from "@/lib/actions/result";
import { toAsciiDigits } from "@/lib/phone";
import {
  ADVANCE_WARNING_MONTHS,
  ELECTRICITY,
  GAS_BILL,
  WATER,
  costsStepSchema,
  type CostsStepInput,
} from "@/lib/validation/listing";
import { Alert } from "@/components/ui/alert";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormError } from "@/components/auth/form-alert";
import { FormField, fieldAria } from "@/components/auth/form-field";
import { StepActions, wantsExit } from "./step-shell";

export function CostsStep({
  listingId,
  defaults,
  hasGas,
}: {
  listingId: string;
  defaults: CostsStepInput;
  /** The building has a gas connection, so ask who pays the gas bill. */
  hasGas: boolean;
}) {
  const t = useTranslations("Wizard");
  const tEnum = useTranslations("Enums");
  const router = useRouter();
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<CostsStepInput, unknown, z.output<typeof costsStepSchema>>({
    resolver: zodResolver(costsStepSchema),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const err = (k: keyof CostsStepInput) => errors[k]?.message as string | undefined;

  const advanceRaw = useWatch({ control: form.control, name: "advanceMonths" });
  const advance = Number(toAsciiDigits(String(advanceRaw ?? "")));
  const showAdvanceWarning = Number.isFinite(advance) && advance > ADVANCE_WARNING_MONTHS;

  const onSubmit = form.handleSubmit((_, event) => {
    const exit = wantsExit(event);
    // The server checks the raw values again with the same schema.
    const values = form.getValues();
    setServerError(null);
    startTransition(async () => {
      const result = await saveCostsStep(listingId, values);
      if (!result.ok) return setServerError(result.error);
      router.push(exit ? "/dashboard/ads?saved=1" : `/post/${listingId}?step=5`);
    });
  });

  const select = (name: "electricity" | "water" | "gasBill", options: readonly string[], enumKey: string, optional = false) => (
    <FormField id={name} label={t(name)} error={err(name)}>
      <NativeSelect {...fieldAria(name, err(name))} {...form.register(name)}>
        {optional ? <option value="">{t("notApplicable")}</option> : <option value="" disabled>{"..."}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {tEnum(`${enumKey}.${o}` as "water.included")}
          </option>
        ))}
      </NativeSelect>
    </FormField>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormError error={serverError} />

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="monthlyRent" label={t("monthlyRent")} error={err("monthlyRent")}>
          <Input {...fieldAria("monthlyRent", err("monthlyRent"))} inputMode="numeric" {...form.register("monthlyRent")} />
        </FormField>
        <FormField id="advanceMonths" label={t("advanceMonths")} error={err("advanceMonths")}>
          <Input {...fieldAria("advanceMonths", err("advanceMonths"))} inputMode="numeric" {...form.register("advanceMonths")} />
        </FormField>
      </div>

      {showAdvanceWarning && (
        <Alert className="border-accent/60 bg-accent/10 text-foreground">
          <TriangleAlert className="text-amber-600" aria-hidden />
          <span className="flex flex-col gap-1">
            <span className="font-semibold">{t("advanceWarningTitle")}</span>
            <span>{t("advanceWarning")}</span>
          </span>
        </Alert>
      )}

      <CheckboxField label={t("rentNegotiable")} {...form.register("rentNegotiable")} />

      <FormField id="serviceCharge" label={t("serviceCharge")} error={err("serviceCharge")} hint={t("serviceChargeHint")}>
        <Input {...fieldAria("serviceCharge", err("serviceCharge"), t("serviceChargeHint"))} inputMode="numeric" className="sm:w-56" {...form.register("serviceCharge")} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-3">
        {select("electricity", ELECTRICITY, "electricity")}
        {select("water", WATER, "water")}
        {hasGas && select("gasBill", GAS_BILL, "gasBill", true)}
      </div>

      <FormField id="otherCharges" label={t("otherCharges")} error={err("otherCharges")}>
        <Input {...fieldAria("otherCharges", err("otherCharges"))} placeholder={t("otherChargesPlaceholder")} {...form.register("otherCharges")} />
      </FormField>

      <StepActions backHref={`/post/${listingId}?step=3`} pending={pending} />
    </form>
  );
}
