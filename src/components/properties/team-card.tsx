"use client";

import { Clock, LogOut, Mail, UserRoundMinus, UserRoundPlus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import type { ErrorKey } from "@/lib/actions/result";
import { cancelBuildingInvite, inviteCaretaker, removeBuildingManager } from "@/lib/actions/team";
import { formatDate } from "@/lib/format";
import type { BuildingTeamRow } from "@/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormSuccess } from "@/components/auth/form-alert";
import { FormField, fieldAria } from "@/components/auth/form-field";

/**
 * F10 caretakers (FR36): who manages the building. The owner invites a
 * caretaker by email, cancels a waiting invitation and removes a caretaker;
 * a caretaker can leave. The database checks each step again.
 */
export function TeamCard({
  buildingId,
  team,
  userId,
  isOwner,
}: {
  buildingId: string;
  team: BuildingTeamRow[];
  userId: string;
  isOwner: boolean;
}) {
  const t = useTranslations("Team");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const members = team.filter((row) => row.kind === "member");
  const invites = team.filter((row) => row.kind === "invite");

  function invite(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFieldError(undefined);
    startTransition(async () => {
      const result = await inviteCaretaker({ buildingId, email });
      if (!result.ok) {
        if (result.fieldErrors?.email) setFieldError(result.fieldErrors.email);
        else setError(result.error);
        return;
      }
      setEmail("");
      setNotice(`${t("invitedTitle")}. ${t("invitedBody")}`);
      router.refresh();
    });
  }

  function cancel(row: BuildingTeamRow) {
    if (!row.invite_id || !window.confirm(t("cancelConfirm", { email: row.email ?? "" }))) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await cancelBuildingInvite(row.invite_id!);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  function remove(row: BuildingTeamRow) {
    if (!row.user_id) return;
    const self = row.user_id === userId;
    const question = self ? t("leaveConfirm") : t("removeConfirm", { name: row.full_name?.trim() || t("member") });
    if (!window.confirm(question)) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await removeBuildingManager(buildingId, row.user_id!);
      if (!result.ok) return setError(result.error);
      if (self) {
        router.push("/dashboard/properties");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{isOwner ? t("hintOwner") : t("hintCaretaker")}</p>
      <FormError error={error} />
      <FormSuccess message={notice} />

      <ul className="flex flex-col divide-y rounded-lg border">
        {members.map((m) => {
          const name = m.full_name?.trim() || t("member");
          const self = m.user_id === userId;
          const removable = m.role === "caretaker" && !m.is_creator && (isOwner || self);
          return (
            <li key={m.user_id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-9">
                  {m.avatar_url && <AvatarImage src={m.avatar_url} alt="" />}
                  <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">
                    {name}
                    {self && <span className="font-normal text-muted-foreground"> ({t("you")})</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant={m.role === "owner" ? "default" : "outline"}>{tEnum(`role.${m.role}`)}</Badge>
                    {m.is_creator && <span>{t("creator")}</span>}
                  </span>
                </div>
              </div>
              {removable && (
                <Button size="sm" variant="ghost" onClick={() => remove(m)} disabled={pending} className="w-fit">
                  {self ? <LogOut aria-hidden /> : <UserRoundMinus aria-hidden />}
                  {self ? t("leave") : t("remove")}
                </Button>
              )}
            </li>
          );
        })}
        {invites.map((inv) => (
          <li key={inv.invite_id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Mail className="size-4" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{inv.email}</span>
                <span className="flex items-center gap-1 text-xs text-amber-800">
                  <Clock className="size-3" aria-hidden />
                  {t("waiting")} · {t("invitedOn", { date: formatDate(inv.created_at, locale) })}
                </span>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => cancel(inv)} disabled={pending} className="w-fit">
              <X aria-hidden />
              {t("cancel")}
            </Button>
          </li>
        ))}
      </ul>

      {isOwner && (
        <form onSubmit={invite} noValidate className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
          <FormField id="caretakerEmail" label={t("inviteLabel")} hint={t("inviteHint")} error={fieldError}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                {...fieldAria("caretakerEmail", fieldError, t("inviteHint"))}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sm:flex-1"
                required
              />
              <Button type="submit" disabled={pending || email.trim() === ""}>
                <UserRoundPlus aria-hidden />
                {pending ? t("inviting") : t("invite")}
              </Button>
            </div>
          </FormField>
        </form>
      )}
    </div>
  );
}
