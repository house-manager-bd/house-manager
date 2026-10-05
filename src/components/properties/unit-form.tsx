"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { saveUnit } from "@/lib/actions/property";
import type { ErrorKey } from "@/lib/actions/result";
import {
  FACINGS,
  FURNISHING,
  UNIT_KINDS,
  unitSchema,
  type UnitInput,
  type UnitValues,
} from "@/lib/validation/property";
import type { UnitRow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormError } from "@/components/auth/form-alert";
import { FormField, fieldAria } from "@/components/auth/form-field";

export function unitToInput(unit: UnitRow): UnitInput {
  const str = (n: number | null) => (n === null ? "" : String(n));
  return {
    label: unit.label,
    unitKind: unit.unit_kind,
    floorNo: str(unit.floor_no),
    sizeSqft: str(unit.size_sqft),
    bedrooms: str(unit.bedrooms),
    bathrooms: str(unit.bathrooms),
    balconies: str(unit.balconies),
    facing: unit.facing ?? "",
    furnishing: unit.furnishing,
    capacity: str(unit.capacity),
  };
}

export function UnitForm({
  buildingId,
  unit,
  onSaved,
  onCancel,
}: {
  buildingId: string;
  unit?: UnitRow;
  onSaved: (unitId: string) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("UnitForm");
  const tEnum = useTranslations("Enums");
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<UnitInput, unknown, UnitValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: unit
      ? unitToInput(unit)
      : { label: "", unitKind: "flat", furnishing: "unfurnished", facing: "", capacity: "" },
  });
  const { errors } = form.formState;
  const kind = useWatch({ control: form.control, name: "unitKind" });
  const err = (key: keyof UnitInput) => errors[key]?.message as string | undefined;
  const prefix = unit ? `unit-${unit.id}` : "unit-new";
  const id = (name: string) => `${prefix}-${name}`;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await saveUnit(buildingId, unit?.id ?? null, values);
      if (!result.ok) {
        setServerError(result.error);
        if (result.error === "labelTaken") form.setError("label", { message: "labelTaken" });
        return;
      }
      if (!unit) form.reset();
      onSaved(result.data.id);
    });
  });

  const numberField = (name: "floorNo" | "sizeSqft" | "bedrooms" | "bathrooms" | "balconies" | "capacity", hint?: string) => (
    <FormField id={id(name)} label={t(name)} error={err(name)} hint={hint}>
      <Input {...fieldAria(id(name), err(name), hint)} inputMode="numeric" {...form.register(name)} />
    </FormField>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError error={serverError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("label")} label={t("label")} error={err("label")}>
          <Input {...fieldAria(id("label"), err("label"))} placeholder={t("labelPlaceholder")} {...form.register("label")} />
        </FormField>
        <FormField id={id("unitKind")} label={t("unitKind")} error={err("unitKind")}>
          <NativeSelect {...fieldAria(id("unitKind"), err("unitKind"))} {...form.register("unitKind")}>
            {UNIT_KINDS.map((k) => (
              <option key={k} value={k}>
                {tEnum(`unitKind.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      {kind === "mess_room" && numberField("capacity")}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {numberField("floorNo", t("floorHint"))}
        {numberField("sizeSqft")}
        {numberField("bedrooms")}
        {numberField("bathrooms")}
        {numberField("balconies")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("facing")} label={t("facing")}>
          <NativeSelect id={id("facing")} {...form.register("facing")}>
            <option value="">{t("notSet")}</option>
            {FACINGS.map((f) => (
              <option key={f} value={f}>
                {tEnum(`facing.${f}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id={id("furnishing")} label={t("furnishing")}>
          <NativeSelect id={id("furnishing")} {...form.register("furnishing")}>
            {FURNISHING.map((f) => (
              <option key={f} value={f}>
                {tEnum(`furnishing.${f}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
