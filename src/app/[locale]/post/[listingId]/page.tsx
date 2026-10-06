import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleAlert, Pencil } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDraftForWizard } from "@/lib/data/listings";
import { areaLabel, getLocationTree } from "@/lib/data/locations";
import { formatDate, formatTaka } from "@/lib/format";
import { FIELD_STEP, missingFields } from "@/lib/listing-checks";
import { formatBdPhoneLocal } from "@/lib/phone";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AboutStep } from "@/components/wizard/about-step";
import { CostsStep } from "@/components/wizard/costs-step";
import { SubmitPanel } from "@/components/wizard/submit-panel";
import { TenantsStep } from "@/components/wizard/tenants-step";
import { WizardProgress } from "@/components/wizard/wizard-progress";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Wizard");
  return { title: t("title"), robots: { index: false } };
}

/** First day of next month, as a sensible default move-in date. */
function nextMonthStart() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 10);
}

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export default async function DraftPage({ params, searchParams }: PageProps<"/[locale]/post/[listingId]">) {
  const { locale: routeLocale, listingId } = await params;
  const { step: stepParam } = await searchParams;
  const lang = routeLocale as "bn" | "en";
  const [t, tEnum, locale, user, tree] = await Promise.all([
    getTranslations("Wizard"),
    getTranslations("Enums"),
    getLocale(),
    getCurrentUser(),
    getLocationTree(),
  ]);
  if (!user) return null;

  const draft = await getDraftForWizard(user.id, listingId);
  if (!draft) notFound();
  const { listing: l, contact, unit, building } = draft;
  // Submitted ads are managed from My ads (editing live ads comes in F10).
  if (l.status !== "draft") return redirect({ href: "/dashboard/ads", locale: lang });

  const step = [3, 4, 5, 6].includes(Number(stepParam)) ? (Number(stepParam) as 3 | 4 | 5 | 6) : 3;
  const area = areaLabel(tree, building.area_id, locale).split(",")[0];
  const typeName = tEnum(`unitKind.${unit.unit_kind}`);
  const suggestedTitle =
    unit.bedrooms && unit.unit_kind === "flat"
      ? t("titleSuggestion", { bedrooms: unit.bedrooms, type: locale === "en" ? typeName.toLowerCase() : typeName, area })
      : t("titleSuggestionNoBeds", { type: typeName, area });

  const missing = missingFields(l, contact.contact_phone, unit);
  const stepTitle = t(`steps.${step}`);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("unitLine", { unit: unit.label, building: building.name })} · {area}
        </p>
      </div>
      <WizardProgress current={step} listingId={l.id} />

      <Card>
        <CardHeader>
          <CardTitle className="hidden sm:block">{step === 6 ? t("reviewTitle") : stepTitle}</CardTitle>
          {step === 6 && <CardDescription>{t("reviewHint")}</CardDescription>}
        </CardHeader>
        <CardContent>
          {step === 3 && (
            <AboutStep
              listingId={l.id}
              defaults={{
                postedAs: l.posted_as,
                unitKind: unit.unit_kind,
                listingType: l.listing_type,
                title: l.title ?? suggestedTitle,
                description: l.description ?? "",
                availableFrom: l.available_from ?? nextMonthStart(),
                ownerName: l.owner_name ?? "",
                subletConsent: l.sublet_consent,
              }}
            />
          )}
          {step === 4 && (
            <CostsStep
              listingId={l.id}
              hasGas={building.gas !== "none"}
              defaults={{
                monthlyRent: str(l.monthly_rent),
                rentNegotiable: l.rent_negotiable,
                advanceMonths: str(l.advance_months),
                serviceCharge: str(l.service_charge),
                electricity: l.electricity ?? ("" as "prepaid"),
                water: l.water ?? ("" as "included"),
                gasBill: l.gas_bill ?? "",
                otherCharges: l.other_charges ?? "",
              }}
            />
          )}
          {step === 5 && (
            <TenantsStep
              listingId={l.id}
              defaults={{
                capacity: unit.capacity,
                listingType: l.listing_type,
                tenantTypes: l.tenant_types as ("family" | "student")[],
                maxOccupants: str(l.max_occupants),
                openSlots: str(l.open_slots),
                extraRules: l.extra_rules ?? "",
                agreementRequired: l.agreement_required,
                contactPhone: formatBdPhoneLocal(contact.contact_phone),
                whatsapp: formatBdPhoneLocal(contact.whatsapp),
              }}
            />
          )}
          {step === 6 && (
            <Review
              t={t}
              tEnum={tEnum}
              locale={locale}
              listingId={l.id}
              missing={missing}
              rows={{
                building: [
                  [t("building"), `${building.name}, ${areaLabel(tree, building.area_id, locale)}`],
                  [t("address"), [building.private?.house_no, building.private?.road_address].filter(Boolean).join(", ")],
                  [t("unit"), `${unit.label} (${typeName})`],
                ],
                ad: [
                  [t("listingType"), tEnum(`listingType.${l.listing_type}`), "listing_type"],
                  [t("postedAs"), tEnum(`postedAs.${l.posted_as}`)],
                  ...(l.posted_as === "caretaker" ? [[t("ownerName"), l.owner_name, "owner_name"] as Row] : []),
                  ...(l.posted_as === "tenant_sublet"
                    ? [[t("subletConsent"), l.sublet_consent ? t("yes") : null, "sublet_consent"] as Row]
                    : []),
                  [t("adTitle"), l.title, "title"],
                  [t("description"), l.description],
                  [t("availableFrom"), l.available_from ? formatDate(l.available_from, locale) : null, "available_from"],
                ],
                costs: [
                  [
                    t("monthlyRent"),
                    l.monthly_rent !== null
                      ? `${formatTaka(l.monthly_rent, locale)}${l.rent_negotiable ? ` (${t("rentNegotiable")})` : ""}`
                      : null,
                    "monthly_rent",
                  ],
                  [
                    t("advanceMonths"),
                    l.advance_months !== null ? t("advanceValue", { count: l.advance_months }) : null,
                    "advance_months",
                  ],
                  [t("serviceCharge"), l.service_charge !== null ? formatTaka(l.service_charge, locale) : null],
                  [t("electricity"), l.electricity ? tEnum(`electricity.${l.electricity}`) : null, "electricity"],
                  [t("water"), l.water ? tEnum(`water.${l.water}`) : null, "water"],
                  ...(building.gas !== "none"
                    ? [[t("gasBill"), l.gas_bill ? tEnum(`gasBill.${l.gas_bill}`) : null] as Row]
                    : []),
                  [t("otherCharges"), l.other_charges],
                ],
                tenants: [
                  [
                    t("tenantTypes"),
                    l.tenant_types.length
                      ? l.tenant_types.map((x) => tEnum(`tenantType.${x as "family"}`)).join(", ")
                      : null,
                    "tenant_types",
                  ],
                  l.listing_type === "mess_seat"
                    ? [t("openSlots"), t("seats", { count: l.open_slots }), "open_slots"]
                    : [t("maxOccupants"), l.max_occupants !== null ? String(l.max_occupants) : null],
                  [t("extraRules"), l.extra_rules],
                  [t("agreementRequired"), l.agreement_required ? t("yes") : t("no")],
                  [t("contactPhone"), contact.contact_phone ? formatBdPhoneLocal(contact.contact_phone) : null, "contact_phone"],
                  [t("whatsapp"), contact.whatsapp ? formatBdPhoneLocal(contact.whatsapp) : null],
                ],
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type Row = [label: string, value: string | null | undefined, field?: string];
type Translator = Awaited<ReturnType<typeof getTranslations<"Wizard">>>;

function Review({
  t,
  locale,
  listingId,
  missing,
  rows,
}: {
  t: Translator;
  tEnum: Awaited<ReturnType<typeof getTranslations<"Enums">>>;
  locale: string;
  listingId: string;
  missing: string[];
  rows: { building: Row[]; ad: Row[]; costs: Row[]; tenants: Row[] };
}) {
  const sections: { title: string; step: number | null; rows: Row[] }[] = [
    { title: t("sectionBuilding"), step: null, rows: rows.building },
    { title: t("sectionAd"), step: 3, rows: rows.ad },
    { title: t("sectionCosts"), step: 4, rows: rows.costs },
    { title: t("sectionTenants"), step: 5, rows: rows.tenants },
  ];
  const missingSteps = [...new Set(missing.map((f) => FIELD_STEP[f]).filter(Boolean))].sort();

  return (
    <div className="flex flex-col gap-6" lang={locale}>
      {missing.length > 0 && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <span className="flex flex-col gap-2">
            <span>{t("missingSteps")}</span>
            <span className="flex flex-wrap gap-2">
              {missingSteps.map((s) => (
                <Link key={s} href={`/post/${listingId}?step=${s}`} className="underline underline-offset-2">
                  {t(`steps.${s as 3}`)}
                </Link>
              ))}
            </span>
          </span>
        </Alert>
      )}

      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{section.title}</h3>
            {section.step && (
              <Link
                href={`/post/${listingId}?step=${section.step}`}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Pencil className="size-3.5" aria-hidden />
                {t("edit")}
              </Link>
            )}
          </div>
          <dl className="divide-y rounded-lg border">
            {section.rows.map(([label, value, field]) => {
              const isMissing = field ? missing.includes(field) : false;
              return (
                <div key={label} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[14rem_1fr]">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words whitespace-pre-line">
                    {isMissing ? (
                      <Badge className="bg-destructive/10 text-destructive">{t("missing")}</Badge>
                    ) : (
                      (value ?? <span className="text-muted-foreground">{t("notProvided")}</span>)
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}

      <SubmitPanel listingId={listingId} canSubmit={missing.length === 0} />
    </div>
  );
}

