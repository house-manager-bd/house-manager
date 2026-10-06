import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, MapPin, Pencil } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { getMyBuilding } from "@/lib/data/properties";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnitsManager } from "@/components/properties/units-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Properties");
  return { title: t("title"), robots: { index: false } };
}

export default async function BuildingPage({
  params,
}: PageProps<"/[locale]/dashboard/properties/[buildingId]">) {
  const { buildingId } = await params;
  const [t, tForm, tEnum, locale, tree, user] = await Promise.all([
    getTranslations("Properties"),
    getTranslations("BuildingForm"),
    getTranslations("Enums"),
    getLocale(),
    getLocationTree(),
    getCurrentUser(),
  ]);
  if (!user) return null;
  const b = await getMyBuilding(user.id, buildingId);
  if (!b) notFound();

  const rules = b.house_rules ?? {};
  const ruleLines = [
    rules.guests_overnight !== undefined && `${tForm("guestsOvernight")}: ${rules.guests_overnight ? "✓" : "✗"}`,
    rules.rooftop_use !== undefined && `${tForm("rooftopUse")}: ${rules.rooftop_use ? "✓" : "✗"}`,
    rules.pets !== undefined && `${tForm("pets")}: ${rules.pets ? "✓" : "✗"}`,
    rules.smoking !== undefined && `${tForm("smoking")}: ${rules.smoking ? "✓" : "✗"}`,
    rules.gate_closing_time && `${tForm("gateClosingTime")}: ${rules.gate_closing_time}`,
    rules.notes,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/properties"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("title")}
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold sm:text-3xl">{b.name}</h1>
          <p className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="size-4" aria-hidden />
            {areaLabel(tree, b.area_id, locale)}
            {b.landmark ? `, ${b.landmark}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="outline">{t("yourRole", { role: tEnum(`role.${b.myRole}`) })}</Badge>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={`/dashboard/properties/${b.id}/edit`}>
            <Pencil aria-hidden />
            {t("editTitle")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("unitsSection")}</CardTitle>
          <CardDescription>{t("unitsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <UnitsManager buildingId={b.id} units={b.units} userId={user.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("detailsSection")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {b.private && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <dt className="flex items-center gap-1 text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden />
                  {t("privateAddress")}
                </dt>
                <dd>
                  {[b.private.house_no, b.private.road_address].filter(Boolean).join(", ")}
                </dd>
                <dd className="text-xs text-muted-foreground">{t("publicPin")}</dd>
              </div>
            )}
            {b.total_floors !== null && (
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{tForm("totalFloors")}</dt>
                <dd>{t("floors", { count: b.total_floors })}</dd>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{tForm("gas")}</dt>
              <dd>{tEnum(`gas.${b.gas}`)}</dd>
            </div>
            {b.amenities.length > 0 && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <dt className="text-muted-foreground">{tForm("amenities")}</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {b.amenities.map((a) => (
                    <Badge key={a}>{tEnum(`amenity.${a as "lift"}`)}</Badge>
                  ))}
                </dd>
              </div>
            )}
            {ruleLines.length > 0 && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <dt className="text-muted-foreground">{t("houseRules")}</dt>
                <dd>
                  <ul className="list-inside list-disc">
                    {ruleLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {b.nearby.length > 0 && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <dt className="text-muted-foreground">{t("nearby")}</dt>
                <dd>
                  <ul className="list-inside list-disc">
                    {b.nearby.map((n) => (
                      <li key={`${n.kind}-${n.name}`}>
                        {tEnum(`nearbyKind.${n.kind}`)}: {n.name}
                        {n.walk_minutes !== null ? ` (${t("walkMinutes", { count: n.walk_minutes })})` : ""}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
