import type { Metadata } from "next";
import { Building2, ChevronRight, MapPin, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { getMyBuildings } from "@/lib/data/properties";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Properties");
  return { title: t("title"), robots: { index: false } };
}

export default async function PropertiesPage() {
  const [t, tEnum, locale, user, tree] = await Promise.all([
    getTranslations("Properties"),
    getTranslations("Enums"),
    getLocale(),
    getCurrentUser(),
    getLocationTree(),
  ]);
  if (!user) return null;
  const buildings = await getMyBuildings(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
          <p className="max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/properties/new">
            <Plus aria-hidden />
            {t("addBuilding")}
          </Link>
        </Button>
      </div>

      {buildings.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <CardHeader className="w-full justify-items-center">
            <span className="mb-2 grid size-12 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <Building2 className="size-6" aria-hidden />
            </span>
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/properties/new">{t("addBuilding")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {buildings.map((b) => (
            <li key={b.id}>
              <Link
                href={`/dashboard/properties/${b.id}`}
                className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm transition-colors outline-none hover:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-lg font-semibold">{b.name}</span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      {areaLabel(tree, b.area_id, locale)}
                    </span>
                  </div>
                  <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{tEnum(`role.${b.myRole}`)}</Badge>
                  <Badge variant="muted">{t("units", { count: b.units.length })}</Badge>
                  {(["vacant", "listed", "occupied"] as const).map((s) => {
                    const n = b.units.filter((u) => u.status === s).length;
                    return n > 0 ? (
                      <Badge key={s} variant={s === "listed" ? "success" : "default"}>
                        {tEnum(`unitStatus.${s}`)}: {new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en").format(n)}
                      </Badge>
                    ) : null;
                  })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
