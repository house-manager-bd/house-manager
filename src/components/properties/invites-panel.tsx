"use client";

import { Building2, Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { ErrorKey } from "@/lib/actions/result";
import { respondBuildingInvite } from "@/lib/actions/team";
import { formatDate } from "@/lib/format";
import type { MyBuildingInviteRow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError, FormSuccess } from "@/components/auth/form-alert";

/** F10: invitations waiting for the member, with Accept and Decline. */
export function InvitesPanel({
  invites,
  areaLabels,
}: {
  invites: MyBuildingInviteRow[];
  /** Area names in the page's language, by area id. */
  areaLabels: Record<number, string>;
}) {
  const t = useTranslations("Team");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (invites.length === 0 && !notice) return null;

  function respond(id: string, accept: boolean) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await respondBuildingInvite(id, accept);
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      if (accept) {
        router.push(`/dashboard/properties/${result.data.buildingId}`);
        return;
      }
      setNotice(t("declinedTitle"));
      router.refresh();
    });
  }

  return (
    <Card id="invites" className="scroll-mt-20 border-accent/60 bg-accent/5">
      <CardHeader>
        <CardTitle>{t("invitesTitle")}</CardTitle>
        <CardDescription>{t("invitesHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <FormError error={error} />
        <FormSuccess message={notice} />
        <ul className="flex flex-col gap-3">
          {invites.map((inv) => (
            <li key={inv.id} className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                  <Building2 className="size-4" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold break-words">{inv.building_name}</span>
                  <span className="text-sm text-muted-foreground">{areaLabels[inv.area_id] ?? ""}</span>
                  <span className="text-sm">{t("invitedBy", { name: inv.inviter_name.trim() || t("member") })}</span>
                  <span className="text-xs text-muted-foreground">{t("invitedOn", { date: formatDate(inv.created_at, locale) })}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => respond(inv.id, true)} disabled={pending}>
                  <Check aria-hidden />
                  {t("accept")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => respond(inv.id, false)} disabled={pending}>
                  <X aria-hidden />
                  {t("decline")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
