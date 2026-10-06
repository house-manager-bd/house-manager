import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getLocationTree } from "@/lib/data/locations";
import { Card, CardContent } from "@/components/ui/card";
import { BuildingForm } from "@/components/properties/building-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Properties");
  return { title: t("newTitle"), robots: { index: false } };
}

export default async function NewBuildingPage({
  searchParams,
}: PageProps<"/[locale]/dashboard/properties/new">) {
  const { next } = await searchParams;
  const [t, tree] = await Promise.all([getTranslations("Properties"), getLocationTree()]);

  // Coming from the post-ad wizard: go back there with the new building.
  const after = next === "post" ? "/post?building={id}" : "/dashboard/properties/{id}";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("newTitle")}</h1>
        <p className="max-w-2xl text-muted-foreground">{t("newSubtitle")}</p>
      </div>
      <Card>
        <CardContent>
          <BuildingForm tree={tree} next={after} />
        </CardContent>
      </Card>
    </div>
  );
}
