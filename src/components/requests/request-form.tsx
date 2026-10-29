"use client";

import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { sendRequest } from "@/lib/actions/request";
import type { ErrorKey } from "@/lib/actions/result";
import { toAsciiDigits } from "@/lib/phone";
import { formatDate } from "@/lib/format";
import {
  addDays,
  dhakaToday,
  HOUSEHOLD_TYPES,
  MESSAGE_MAX,
  MOVE_IN_MAX_DAYS,
  OCCUPATION_MAX,
  sendRequestSchema,
} from "@/lib/validation/request";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/auth/form-alert";
import { FormField, fieldAria } from "@/components/auth/form-field";

type Household = (typeof HOUSEHOLD_TYPES)[number];
type Field = "householdType" | "membersCount" | "occupation" | "moveInDate" | "message";

/**
 * "Send a request" on a live ad (FR21). Opens a short form in place, so it
 * works the same on a phone. The database checks everything again
 * (send_request), including the ad's people limit and the 10 open requests.
 */
export function RequestForm({
  listingId,
  tenantTypes,
  maxMembers,
  seats,
  availableFrom,
}: {
  listingId: string;
  /** Who the ad is for, already translated. */
  tenantTypes: string[];
  /** max_occupants of the ad, if set. */
  maxMembers: number | null;
  /** Seats on offer, for mess seat ads. */
  seats: number | null;
  availableFrom: string | null;
}) {
  const t = useTranslations("RequestForm");
  const tEnum = useTranslations("Enums");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();

  const today = dhakaToday();
  const lastDay = addDays(today, MOVE_IN_MAX_DAYS);
  const firstDay = availableFrom && availableFrom > today && availableFrom <= lastDay ? availableFrom : today;

  const [open, setOpen] = useState(false);
  const [householdType, setHouseholdType] = useState<Household | null>(null);
  const [membersCount, setMembersCount] = useState("");
  const [occupation, setOccupation] = useState("");
  const [moveInDate, setMoveInDate] = useState(firstDay);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, ErrorKey>>>({});
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Bring the opened form into view (inside the scrollable sidebar on computers).
  useEffect(() => {
    if (open) formRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  const limit = maxMembers ?? seats;

  if (!open) {
    return (
      <Button size="lg" className="w-full" onClick={() => setOpen(true)}>
        <Send aria-hidden />
        {t("open")}
      </Button>
    );
  }

  function send(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const input = { listingId, householdType: householdType ?? "", membersCount, occupation, moveInDate, message };
    const parsed = sendRequestSchema.safeParse(input);
    const next: Partial<Record<Field, ErrorKey>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Field;
        if (!next[key]) next[key] = issue.message as ErrorKey;
      }
    }
    // The ad's own limit, so the member does not wait for the server to say so.
    const count = Number(toAsciiDigits(membersCount).trim());
    if (!next.membersCount && limit !== null && count > limit) next.membersCount = "tooManyMembers";
    setErrors(next);
    if (Object.keys(next).length) return;

    // The schema passed, so a household type is chosen.
    const valid = { ...input, householdType: householdType as Household };
    startTransition(async () => {
      const result = await sendRequest(valid);
      if (!result.ok) {
        const fields = result.fieldErrors as Partial<Record<Field, ErrorKey>> | undefined;
        if (fields && Object.keys(fields).length) setErrors(fields);
        else if (result.error === "tooManyMembers" || result.error === "moveInInvalid") {
          setErrors({ [result.error === "tooManyMembers" ? "membersCount" : "moveInDate"]: result.error });
        } else setError(result.error);
        return;
      }
      // The page shows the request's status from now on, with a "sent" note.
      // (No router.refresh: it would cancel this navigation, and the action
      // has already revalidated the page.)
      router.replace(`/ads/${listingId}?request=sent`, { scroll: false });
    });
  }

  const membersHint =
    maxMembers !== null
      ? t("membersMax", { max: maxMembers })
      : seats !== null
        ? t("membersSeats", { count: seats })
        : undefined;
  const moveInHint = availableFrom && availableFrom > today ? t("availableFrom", { date: formatDate(availableFrom, locale) }) : undefined;

  return (
    <form ref={formRef} onSubmit={send} className="flex scroll-mt-24 flex-col gap-4" noValidate>
      <fieldset className="flex flex-col gap-2" aria-describedby={`${id}-for`}>
        <legend className="mb-1 text-sm font-medium">{t("household")}</legend>
        <p id={`${id}-for`} className="mb-1 text-xs text-muted-foreground">
          {t("adIsFor", { types: tenantTypes.join(", ") })}
        </p>
        <div className="grid gap-2">
          {HOUSEHOLD_TYPES.map((h) => (
            <label
              key={h}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted",
                "has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                errors.householdType && "border-destructive",
              )}
            >
              <input
                type="radio"
                name={`${id}-household`}
                value={h}
                checked={householdType === h}
                onChange={() => setHouseholdType(h)}
                className="size-4 shrink-0 accent-primary"
              />
              <span>{tEnum(`householdType.${h}`)}</span>
            </label>
          ))}
        </div>
        {errors.householdType && <FieldError error={errors.householdType} />}
      </fieldset>

      <FormField id={`${id}-members`} label={t("members")} error={errors.membersCount} hint={membersHint}>
        <Input
          {...fieldAria(`${id}-members`, errors.membersCount, membersHint)}
          inputMode="numeric"
          autoComplete="off"
          value={membersCount}
          onChange={(e) => setMembersCount(e.target.value)}
          className="max-w-32"
        />
      </FormField>

      <FormField id={`${id}-occupation`} label={t("occupation")} error={errors.occupation}>
        <Input
          {...fieldAria(`${id}-occupation`, errors.occupation)}
          value={occupation}
          onChange={(e) => setOccupation(e.target.value)}
          maxLength={OCCUPATION_MAX}
          placeholder={t("occupationPlaceholder")}
          autoComplete="organization-title"
        />
      </FormField>

      <FormField id={`${id}-move-in`} label={t("moveIn")} error={errors.moveInDate} hint={moveInHint}>
        <Input
          {...fieldAria(`${id}-move-in`, errors.moveInDate, moveInHint)}
          type="date"
          min={today}
          max={lastDay}
          value={moveInDate}
          onChange={(e) => setMoveInDate(e.target.value)}
          className="max-w-48"
        />
      </FormField>

      <FormField id={`${id}-message`} label={t("message")} error={errors.message}>
        <Textarea
          {...fieldAria(`${id}-message`, errors.message)}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MESSAGE_MAX}
          rows={4}
          placeholder={t("messagePlaceholder")}
        />
      </FormField>

      <p className="text-xs text-muted-foreground">{t("sharedNote")}</p>
      <FormError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          <Send aria-hidden />
          {pending ? t("sending") : t("send")}
        </Button>
      </div>
    </form>
  );
}

function FieldError({ error }: { error: ErrorKey }) {
  const t = useTranslations("Errors");
  return <p className="text-sm text-destructive">{t(error)}</p>;
}
