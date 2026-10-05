import type { Metadata } from "next";
import { ArrowLeft, Building2, ChevronRight, MapPin, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { getMyBuildings } from "@/lib/data/properties";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PickUnit } from "@/components/wizard/pick-unit";
import { WizardProgress } from "@/components/wizard/wizard-progress";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Wizard");
  return { title: t("title"), robots: { index: false } };
}

// Steps 1 and 2 of the post-ad wizard: building, then unit.
// Picking a unit creates the draft, and steps 3 to 6 live at /post/[id].
export default async function PostPage({ searchParams }: PageProps<"/[locale]/post">) {
  const { building: buildingParam } = await searchParams;
  const [t, tProps, locale, user, tree] = await Promise.all([
    getTranslations("Wizard"),
    getTranslations("Properties"),
    getLocale(),
    getCurrentUser(),
    getLocationTree(),
  ]);
  if (!user) return null; // The proxy sends visitors to /login.

  const buildings = await getMyBuildings(user.id);
  const selected =
    typeof buildingParam === "string" ? buildings.find((b) => b.id === buildingParam) : undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
      <WizardProgress current={selected ? 2 : 1} />

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("pickUnitTitle")}</CardTitle>
            <CardDescription>{t("pickUnitHint", { building: selected.name })}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PickUnit building={selected} userId={user.id} />
            <Link href="/post" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden />
              {t("changeBuilding")}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("pickBuildingTitle")}</CardTitle>
            <CardDescription>{buildings.length ? t("pickBuildingHint") : t("noBuildings")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
              {buildings.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/post?building=${b.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border p-4 outline-none hover:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                        <Building2 className="size-5" aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold">{b.name}</span>
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          {areaLabel(tree, b.area_id, locale)} · {tProps("units", { count: b.units.length })}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <Button asChild variant={buildings.length ? "outline" : "default"} className="w-fit">
              <Link href="/dashboard/properties/new?next=post">
                <Plus aria-hidden />
                {t("addNewBuilding")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
