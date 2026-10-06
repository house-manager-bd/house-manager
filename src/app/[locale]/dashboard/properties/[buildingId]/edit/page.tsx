import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { getLocationTree } from "@/lib/data/locations";
import { getMyBuilding } from "@/lib/data/properties";
import { Card, CardContent } from "@/components/ui/card";
import { BuildingForm } from "@/components/properties/building-form";
import { buildingToInput } from "@/components/properties/building-input";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Properties");
  return { title: t("editTitle"), robots: { index: false } };
}

export default async function EditBuildingPage({
  params,
}: PageProps<"/[locale]/dashboard/properties/[buildingId]/edit">) {
  const { buildingId } = await params;
  const [t, tree, user] = await Promise.all([
    getTranslations("Properties"),
    getLocationTree(),
    getCurrentUser(),
  ]);
  if (!user) return null;
  const building = await getMyBuilding(user.id, buildingId);
  if (!building) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("editTitle")}</h1>
      <Card>
        <CardContent>
          <BuildingForm
            tree={tree}
            buildingId={building.id}
            defaultValues={buildingToInput(building)}
            next="/dashboard/properties/{id}"
          />
        </CardContent>
      </Card>
    </div>
  );
}
