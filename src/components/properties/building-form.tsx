"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Crosshair, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";
import { saveBuilding } from "@/lib/actions/property";
import type { ErrorKey } from "@/lib/actions/result";
import type { LocationTree } from "@/lib/data/locations";
import {
  AMENITIES,
  BUILDING_FORM_STEPS,
  GAS_TYPES,
  MY_ROLES,
  NEARBY_KINDS,
  buildingSchema,
  type BuildingInput,
  type BuildingValues,
} from "@/lib/validation/property";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/auth/form-alert";
import { FormField, fieldAria } from "@/components/auth/form-field";
import { LocationPicker } from "./location-picker";
import { MapPickerLazy } from "./map-picker-lazy";
import type { LatLng } from "./map-picker";

const PART_TITLES = ["part1", "part2", "part3", "part4"] as const;

// Mirpur 10, used only if no area is chosen yet.
const FALLBACK_CENTER: LatLng = { lat: 23.8069, lng: 90.3686 };

export function BuildingForm({
  tree,
  buildingId = null,
  defaultValues,
  next,
}: {
  tree: LocationTree;
  buildingId?: string | null;
  defaultValues?: Partial<BuildingInput>;
  /** Where to go after saving. "{id}" is replaced with the building id. */
  next: string;
}) {
  const t = useTranslations("BuildingForm");
  const tEnum = useTranslations("Enums");
  const tErrors = useTranslations("Errors");
  const router = useRouter();
  const [part, setPart] = useState(0);
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = buildingId !== null;

  const form = useForm<BuildingInput, unknown, BuildingValues>({
    resolver: zodResolver(buildingSchema),
    defaultValues: {
      name: "",
      landmark: "",
      roadAddress: "",
      houseNo: "",
      gas: "titas_line",
      amenities: [],
      pets: false,
      smoking: false,
      guestsOvernight: true,
      rooftopUse: false,
      gateClosingTime: "",
      rulesNotes: "",
      nearby: [],
      ...defaultValues,
    },
  });
  const { errors } = form.formState;
  const nearby = useFieldArray({ control: form.control, name: "nearby" });

  const [areaId, lat, lng] = useWatch({ control: form.control, name: ["areaId", "lat", "lng"] }) as [
    number | undefined,
    number | undefined,
    number | undefined,
  ];
  const area = tree.areas.find((a) => a.id === Number(areaId));
  const center = area ? { lat: area.center_lat, lng: area.center_lng } : FALLBACK_CENTER;
  const pin = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;

  const setPin = useCallback(
    (p: LatLng) => {
      form.setValue("lat", Number(p.lat.toFixed(6)), { shouldValidate: true });
      form.setValue("lng", Number(p.lng.toFixed(6)), { shouldValidate: true });
    },
    [form],
  );

  async function goNext() {
    const ok = await form.trigger([...BUILDING_FORM_STEPS[part]]);
    if (!ok) return;
    // Start the pin at the area centre the first time the map opens.
    if (part === 0 && !pin) setPin(center);
    setPart((p) => p + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const onSubmit = form.handleSubmit(
    (values) => {
      setServerError(null);
      startTransition(async () => {
        const result = await saveBuilding(buildingId, values);
        if (!result.ok) {
          setServerError(result.error);
          return;
        }
        router.push(next.replace("{id}", result.data.id));
        router.refresh();
      });
    },
    () => {
      // A field on an earlier part is invalid: jump back to it.
      const first = BUILDING_FORM_STEPS.findIndex((fields) =>
        fields.some((f) => f in form.formState.errors),
      );
      if (first >= 0) setPart(first);
    },
  );

  const err = (key: keyof BuildingInput) => errors[key]?.message as string | undefined;

  return (
    <form
      onSubmit={(event) => {
        // Only the last part saves. Pressing Enter on an earlier part moves on.
        if (part < PART_TITLES.length - 1) {
          event.preventDefault();
          void goNext();
          return;
        }
        void onSubmit(event);
      }}
      noValidate
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t("stepOf", { current: part + 1, total: PART_TITLES.length })}
        </p>
        <h2 className="text-xl font-semibold">{t(PART_TITLES[part])}</h2>
        <div className="flex gap-1.5" aria-hidden>
          {PART_TITLES.map((key, i) => (
            <span key={key} className={cn("h-1.5 flex-1 rounded-full", i <= part ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </div>

      <FormError error={serverError} />

      {/* Part 1: basics and location */}
      <div className={cn("flex flex-col gap-5", part !== 0 && "hidden")}>
        {!isEdit && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t("myRole")}</legend>
            <div className="grid gap-2">
              {MY_ROLES.map((role) => (
                <label
                  key={role}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                >
                  <input type="radio" value={role} className="size-4 accent-primary" {...form.register("myRole")} />
                  {tEnum(`myRole.${role}`)}
                </label>
              ))}
            </div>
            {err("myRole") ? (
              <p className="text-sm text-destructive">{tErrors(err("myRole") as ErrorKey)}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("myRoleHint")}</p>
            )}
          </fieldset>
        )}

        <FormField id="name" label={t("name")} error={err("name")} hint={t("nameHint")}>
          <Input {...fieldAria("name", err("name"), t("nameHint"))} placeholder={t("namePlaceholder")} {...form.register("name")} />
        </FormField>

        <Controller
          control={form.control}
          name="areaId"
          render={({ field }) => (
            <LocationPicker
              tree={tree}
              areaId={field.value ? Number(field.value) : null}
              onAreaChange={(id) => field.onChange(id ?? undefined)}
              error={err("areaId")}
            />
          )}
        />

        <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
          <FormField id="landmark" label={t("landmark")} error={err("landmark")}>
            <Input {...fieldAria("landmark", err("landmark"))} placeholder={t("landmarkPlaceholder")} {...form.register("landmark")} />
          </FormField>
          <FormField id="totalFloors" label={t("totalFloors")} error={err("totalFloors")}>
            <Input {...fieldAria("totalFloors", err("totalFloors"))} inputMode="numeric" {...form.register("totalFloors")} />
          </FormField>
        </div>
      </div>

      {/* Part 2: exact address and pin */}
      <div className={cn("flex flex-col gap-5", part !== 1 && "hidden")}>
        <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
          <FormField id="roadAddress" label={t("roadAddress")} error={err("roadAddress")}>
            <Input {...fieldAria("roadAddress", err("roadAddress"))} placeholder={t("roadAddressPlaceholder")} {...form.register("roadAddress")} />
          </FormField>
          <FormField id="houseNo" label={t("houseNo")} error={err("houseNo")}>
            <Input {...fieldAria("houseNo", err("houseNo"))} {...form.register("houseNo")} />
          </FormField>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{t("pin")}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPin(center)}>
              <Crosshair aria-hidden />
              {t("useAreaCenter")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("pinHint")}</p>
          {part === 1 && <MapPickerLazy value={pin} center={center} onChange={setPin} label={t("pin")} />}
          {(err("lat") || err("lng")) && (
            <p className="text-sm text-destructive">{tErrors((err("lat") ?? err("lng")) as ErrorKey)}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("pinPrivacy")}</p>
        </div>
      </div>

      {/* Part 3: gas, facilities, house rules */}
      <div className={cn("flex flex-col gap-6", part !== 2 && "hidden")}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t("gas")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {GAS_TYPES.map((gas) => (
              <label
                key={gas}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
              >
                <input type="radio" value={gas} className="size-4 accent-primary" {...form.register("gas")} />
                {tEnum(`gas.${gas}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t("amenities")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {AMENITIES.map((a) => (
              <CheckboxField key={a} value={a} label={tEnum(`amenity.${a}`)} {...form.register("amenities")} />
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t("rules")}</legend>
          <p className="mb-2 text-xs text-muted-foreground">{t("rulesHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <CheckboxField label={t("guestsOvernight")} {...form.register("guestsOvernight")} />
            <CheckboxField label={t("rooftopUse")} {...form.register("rooftopUse")} />
            <CheckboxField label={t("pets")} {...form.register("pets")} />
            <CheckboxField label={t("smoking")} {...form.register("smoking")} />
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-[12rem_1fr]">
          <FormField id="gateClosingTime" label={t("gateClosingTime")} error={err("gateClosingTime")} hint={t("gateClosingHint")}>
            <Input {...fieldAria("gateClosingTime", err("gateClosingTime"), t("gateClosingHint"))} type="time" {...form.register("gateClosingTime")} />
          </FormField>
          <FormField id="rulesNotes" label={t("rulesNotes")} error={err("rulesNotes")}>
            <Textarea {...fieldAria("rulesNotes", err("rulesNotes"))} rows={2} className="min-h-10" placeholder={t("rulesNotesPlaceholder")} {...form.register("rulesNotes")} />
          </FormField>
        </div>
      </div>

      {/* Part 4: nearby places */}
      <div className={cn("flex flex-col gap-4", part !== 3 && "hidden")}>
        <p className="text-sm text-muted-foreground">{t("nearbyHint")}</p>
        {nearby.fields.map((field, i) => {
          const e = errors.nearby?.[i];
          return (
            <div key={field.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[11rem_1fr_8rem_auto] sm:items-end">
              <FormField id={`nearby.${i}.kind`} label={t("nearbyKind")}>
                <NativeSelect id={`nearby.${i}.kind`} {...form.register(`nearby.${i}.kind`)}>
                  {NEARBY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {tEnum(`nearbyKind.${k}`)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id={`nearby.${i}.name`} label={t("nearbyName")} error={e?.name?.message}>
                <Input {...fieldAria(`nearby.${i}.name`, e?.name?.message)} placeholder={t("nearbyNamePlaceholder")} {...form.register(`nearby.${i}.name`)} />
              </FormField>
              <FormField id={`nearby.${i}.walkMinutes`} label={t("walkMinutes")} error={e?.walkMinutes?.message}>
                <Input {...fieldAria(`nearby.${i}.walkMinutes`, e?.walkMinutes?.message)} inputMode="numeric" {...form.register(`nearby.${i}.walkMinutes`)} />
              </FormField>
              <Button type="button" variant="ghost" size="icon" onClick={() => nearby.remove(i)} aria-label={t("removeNearby")}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          );
        })}
        {nearby.fields.length < 10 && (
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => nearby.append({ kind: "bus_stop", name: "", walkMinutes: "" })}
          >
            <Plus aria-hidden />
            {t("addNearby")}
          </Button>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-between">
        {part > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setPart((p) => p - 1)} disabled={pending}>
            {t("back")}
          </Button>
        ) : (
          <span />
        )}
        {part < PART_TITLES.length - 1 ? (
          <Button key="next" type="button" size="lg" onClick={goNext}>
            {t("next")}
          </Button>
        ) : (
          <Button key="save" type="submit" size="lg" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
        )}
      </div>
    </form>
  );
}
