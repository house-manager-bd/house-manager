"use client";

import { ChevronRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { startListing } from "@/lib/actions/listing";
import type { ErrorKey } from "@/lib/actions/result";
import type { MyBuilding } from "@/lib/data/properties";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";
import { UnitForm } from "@/components/properties/unit-form";
import { UnitSummary } from "@/components/properties/units-manager";

/** Step 2: pick a unit in the chosen building (or add one), then start the draft. */
export function PickUnit({ building, userId }: { building: MyBuilding; userId: string }) {
  const t = useTranslations("Wizard");
  const router = useRouter();
  const [adding, setAdding] = useState(building.units.length === 0);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(unitId: string) {
    setError(null);
    startTransition(async () => {
      const result = await startListing(unitId);
      if (!result.ok) return setError(result.error);
      router.push(`/post/${result.data.id}?step=3`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormError error={error} />
      <ul className="flex flex-col gap-2">
        {building.units.map((unit) => {
          const open = unit.openListing;
          const myDraft = open?.status === "draft" && open.posted_by === userId;
          const blocked = (open && !myDraft) || unit.status === "occupied";
          return (
            <li key={unit.id}>
              {myDraft ? (
                <Link
                  href={`/post/${open!.id}?step=3`}
                  className="flex items-center justify-between gap-3 rounded-lg border p-4 hover:border-primary/50"
                >
                  <span className="flex flex-col gap-1">
                    <span className="font-semibold">{unit.label}</span>
                    <UnitSummary unit={unit} />
                  </span>
                  <span className="flex items-center gap-1 text-sm font-medium text-primary">
                    {t("continueDraft")}
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={blocked || pending}
                  onClick={() => choose(unit.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border p-4 text-left outline-none hover:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border"
                >
                  <span className="flex flex-col gap-1">
                    <span className="font-semibold">{unit.label}</span>
                    <UnitSummary unit={unit} />
                  </span>
                  {blocked ? (
                    <Badge variant="muted">
                      {unit.status === "occupied" ? t("unitOccupied") : t("unitBusy")}
                    </Badge>
                  ) : (
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="rounded-lg border border-dashed p-4">
          <p className="mb-3 font-medium">{t("addNewUnit")}</p>
          <UnitForm
            buildingId={building.id}
            onSaved={(unitId) => choose(unitId)}
            onCancel={building.units.length > 0 ? () => setAdding(false) : undefined}
          />
        </div>
      ) : (
        <Button variant="outline" className="w-fit" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          {t("addNewUnit")}
        </Button>
      )}
    </div>
  );
}
