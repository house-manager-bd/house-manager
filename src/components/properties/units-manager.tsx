"use client";

import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { startListing } from "@/lib/actions/listing";
import { deleteUnit } from "@/lib/actions/property";
import type { ErrorKey } from "@/lib/actions/result";
import type { MyBuilding } from "@/lib/data/properties";
import { formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError, FormSuccess } from "@/components/auth/form-alert";
import { UnitForm } from "./unit-form";

type Unit = MyBuilding["units"][number];

export function UnitSummary({ unit }: { unit: Unit }) {
  const t = useTranslations("UnitForm");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const parts = [
    tEnum(`unitKind.${unit.unit_kind}`),
    unit.floor_no !== null ? `${t("floorNo")} ${formatNumber(unit.floor_no, locale)}` : null,
    unit.bedrooms !== null ? `${t("bedrooms")} ${formatNumber(unit.bedrooms, locale)}` : null,
    unit.bathrooms !== null ? `${t("bathrooms")} ${formatNumber(unit.bathrooms, locale)}` : null,
    unit.size_sqft !== null ? `${formatNumber(unit.size_sqft, locale)} ${t("sizeSqft").split(" ")[0]}` : null,
    unit.unit_kind === "mess_room" ? `${t("capacity")}: ${formatNumber(unit.capacity, locale)}` : null,
  ].filter(Boolean);
  return <span className="text-sm text-muted-foreground">{parts.join(" · ")}</span>;
}

export function UnitStatusBadge({ unit }: { unit: Unit }) {
  const tEnum = useTranslations("Enums");
  if (unit.openListing) {
    const s = unit.openListing.status;
    return <Badge variant={s === "active" ? "success" : "warning"}>{tEnum(`listingStatus.${s}`)}</Badge>;
  }
  return (
    <Badge variant={unit.status === "occupied" ? "muted" : "default"}>
      {tEnum(`unitStatus.${unit.status}`)}
    </Badge>
  );
}

export function UnitsManager({
  buildingId,
  units,
  userId,
}: {
  buildingId: string;
  units: Unit[];
  userId: string;
}) {
  const t = useTranslations("Properties");
  const tWizard = useTranslations("Wizard");
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(units.length === 0);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saved() {
    setEditing(null);
    setAdding(false);
    setNotice(t("unitSaved"));
    router.refresh();
  }

  function postAd(unitId: string) {
    setError(null);
    startTransition(async () => {
      const result = await startListing(unitId);
      if (!result.ok) return setError(result.error);
      router.push(`/post/${result.data.id}`);
    });
  }

  function remove(unitId: string, label: string) {
    if (!window.confirm(`${t("deleteUnit")}: ${label}?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteUnit(buildingId, unitId);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormError error={error} />
      <FormSuccess message={notice} />

      {units.length === 0 && !adding && <p className="text-sm text-muted-foreground">{t("noUnits")}</p>}

      <ul className="flex flex-col gap-3">
        {units.map((unit) => {
          const draftIsMine = unit.openListing?.status === "draft" && unit.openListing.posted_by === userId;
          return (
            <li key={unit.id} className="rounded-lg border p-4">
              {editing === unit.id ? (
                <UnitForm buildingId={buildingId} unit={unit} onSaved={saved} onCancel={() => setEditing(null)} />
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{unit.label}</span>
                      <UnitStatusBadge unit={unit} />
                    </div>
                    <UnitSummary unit={unit} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {draftIsMine ? (
                      <Button asChild size="sm">
                        <Link href={`/post/${unit.openListing!.id}`}>{tWizard("continueDraft")}</Link>
                      </Button>
                    ) : !unit.openListing && unit.status !== "occupied" ? (
                      <Button size="sm" onClick={() => postAd(unit.id)} disabled={pending}>
                        <Megaphone aria-hidden />
                        {t("postAdForUnit")}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setEditing(unit.id)} disabled={pending}>
                      <Pencil aria-hidden />
                      {t("editUnit")}
                    </Button>
                    {!unit.openListing && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(unit.id, unit.label)}
                        disabled={pending}
                        aria-label={`${t("deleteUnit")}: ${unit.label}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="rounded-lg border border-dashed p-4">
          <UnitForm
            buildingId={buildingId}
            onSaved={saved}
            onCancel={units.length > 0 ? () => setAdding(false) : undefined}
          />
        </div>
      ) : (
        <Button variant="outline" className="w-fit" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          {t("addUnit")}
        </Button>
      )}
    </div>
  );
}
