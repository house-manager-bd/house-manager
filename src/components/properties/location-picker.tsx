"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { LocationTree } from "@/lib/data/locations";
import { NativeSelect } from "@/components/ui/native-select";
import { FormField, fieldAria } from "@/components/auth/form-field";

/**
 * Division, district, thana and area in four linked dropdowns.
 * Only the area is stored; the other three narrow the list.
 */
export function LocationPicker({
  tree,
  areaId,
  onAreaChange,
  error,
}: {
  tree: LocationTree;
  areaId: number | null;
  onAreaChange: (areaId: number | null) => void;
  error?: string;
}) {
  const t = useTranslations("Location");
  const locale = useLocale();
  const name = (r: { name_en: string; name_bn: string }) => (locale === "bn" ? r.name_bn : r.name_en);

  // Work out the starting division, district and thana from the saved area,
  // or default to Dhaka, since only Mirpur has areas so far.
  const initial = useMemo(() => {
    const area = tree.areas.find((a) => a.id === areaId);
    const thana = tree.thanas.find((x) => x.id === area?.thana_id);
    const district =
      tree.districts.find((x) => x.id === thana?.district_id) ??
      tree.districts.find((x) => x.name_en === "Dhaka");
    return {
      divisionId: district?.division_id ?? null,
      districtId: district?.id ?? null,
      thanaId: thana?.id ?? null,
    };
  }, [tree, areaId]);

  const [divisionId, setDivisionId] = useState<number | null>(initial.divisionId);
  const [districtId, setDistrictId] = useState<number | null>(initial.districtId);
  const [thanaId, setThanaId] = useState<number | null>(initial.thanaId);

  const districts = tree.districts.filter((d) => d.division_id === divisionId);
  const thanas = tree.thanas.filter((x) => x.district_id === districtId);
  const areas = tree.areas.filter((a) => a.thana_id === thanaId);
  const sortByName = <T extends { name_en: string; name_bn: string }>(list: T[]) =>
    [...list].sort((a, b) => name(a).localeCompare(name(b), locale));

  const toNum = (v: string) => (v === "" ? null : Number(v));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="divisionId" label={t("division")}>
        <NativeSelect
          id="divisionId"
          value={divisionId ?? ""}
          onChange={(e) => {
            setDivisionId(toNum(e.target.value));
            setDistrictId(null);
            setThanaId(null);
            onAreaChange(null);
          }}
        >
          <option value="">{t("choose")}</option>
          {sortByName(tree.divisions).map((d) => (
            <option key={d.id} value={d.id}>
              {name(d)}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      <FormField id="districtId" label={t("district")}>
        <NativeSelect
          id="districtId"
          value={districtId ?? ""}
          disabled={!divisionId}
          onChange={(e) => {
            setDistrictId(toNum(e.target.value));
            setThanaId(null);
            onAreaChange(null);
          }}
        >
          <option value="">{t("choose")}</option>
          {sortByName(districts).map((d) => (
            <option key={d.id} value={d.id}>
              {name(d)}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      {districtId && thanas.length === 0 ? (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground sm:col-span-2">
          {t("notAvailableYet")}
        </p>
      ) : (
        <>
          <FormField id="thanaId" label={t("thana")}>
            <NativeSelect
              id="thanaId"
              value={thanaId ?? ""}
              disabled={!districtId}
              onChange={(e) => {
                setThanaId(toNum(e.target.value));
                onAreaChange(null);
              }}
            >
              <option value="">{t("choose")}</option>
              {sortByName(thanas).map((x) => (
                <option key={x.id} value={x.id}>
                  {name(x)}
                </option>
              ))}
            </NativeSelect>
          </FormField>

          <FormField id="areaId" label={t("area")} error={error}>
            <NativeSelect
              {...fieldAria("areaId", error)}
              value={areaId ?? ""}
              disabled={!thanaId}
              onChange={(e) => onAreaChange(toNum(e.target.value))}
            >
              <option value="">{t("choose")}</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {name(a)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </>
      )}
    </div>
  );
}
