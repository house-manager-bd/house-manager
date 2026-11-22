"use client";

import { CalendarPlus, CircleCheck, CopyPlus, KeyRound, Pause, Pencil, Play } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  markListingRented,
  pauseListing,
  relistListing,
  renewListing,
  resumeListing,
} from "@/lib/actions/listing";
import type { ActionResult, ErrorKey } from "@/lib/actions/result";
import { formatDate } from "@/lib/format";
import { manageState, type ManagedListing } from "@/lib/listing-manage";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";

type Done = { title: string; body?: string };

/**
 * F10: what the poster can do with an ad that is live, expired or rented:
 * edit, pause or resume, renew, mark as rented, and re-list. Used on My ads
 * and on the ad's own page. The database checks every rule again.
 */
export function ManageActions({
  listing,
  unitHeldByOther = false,
  unitHasTenancy = false,
  showEdit = true,
}: {
  listing: ManagedListing;
  /** Another ad holds the unit now: no renewing, marking rented or re-listing this one. */
  unitHeldByOther?: boolean;
  /** A tenancy made on the site is active on the unit: no re-listing yet. */
  unitHasTenancy?: boolean;
  showEdit?: boolean;
}) {
  const t = useTranslations("Ads");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, startTransition] = useTransition();
  const state = manageState(listing);
  const { status } = listing;
  const paused = status === "active" && listing.paused_at !== null;

  function run(action: () => Promise<ActionResult>, ok: () => Done | null) {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      const message = ok();
      if (message) setDone(message);
      router.refresh();
    });
  }

  function pauseOrResume() {
    if (paused) {
      run(() => resumeListing(listing.id), () => ({ title: t("resumedTitle"), body: t("resumedBody") }));
    } else {
      if (!window.confirm(t("pauseConfirm"))) return;
      run(() => pauseListing(listing.id), () => ({ title: t("pausedTitle"), body: t("pausedBody") }));
    }
  }

  function renew() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await renewListing(listing.id);
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      setDone({ title: t("renewedTitle"), body: t("renewedBody", { date: formatDate(result.data.expiresAt, locale) }) });
      router.refresh();
    });
  }

  function markRented() {
    if (!window.confirm(t("markRentedConfirm"))) return;
    run(() => markListingRented(listing.id), () => ({ title: t("rentedTitle"), body: t("rentedBody") }));
  }

  function relist() {
    if (!window.confirm(t("relistConfirm"))) return;
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await relistListing(listing.id);
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      router.push(`/post/${result.data.id}?step=3&relisted=${result.data.photosCopied}`);
    });
  }

  const canRelist = (status === "rented" || status === "expired") && !unitHeldByOther && !unitHasTenancy;
  const buttons = (
    <>
      {status === "active" && showEdit && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/post/${listing.id}?step=3`}>
            <Pencil aria-hidden />
            {t("edit")}
          </Link>
        </Button>
      )}
      {status === "active" && (
        <Button size="sm" variant="outline" onClick={pauseOrResume} disabled={pending}>
          {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          {paused ? t("resume") : t("pause")}
        </Button>
      )}
      {state.canRenew && !(status === "expired" && unitHeldByOther) && (
        <Button size="sm" variant={status === "expired" ? "default" : "accent"} onClick={renew} disabled={pending}>
          <CalendarPlus aria-hidden />
          {t("renew")}
        </Button>
      )}
      {(status === "active" || (status === "expired" && !unitHeldByOther)) && (
        <Button size="sm" variant="outline" onClick={markRented} disabled={pending}>
          <KeyRound aria-hidden />
          {t("markRented")}
        </Button>
      )}
      {canRelist && (
        <Button size="sm" variant={status === "rented" ? "default" : "outline"} onClick={relist} disabled={pending}>
          <CopyPlus aria-hidden />
          {t("relist")}
        </Button>
      )}
    </>
  );

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
        {buttons}
        {pending && <span className="text-sm text-muted-foreground">{t("working")}</span>}
      </div>
      <FormError error={error} />
      {done && (
        <Alert variant="success" role="status">
          <CircleCheck aria-hidden />
          <span className="flex flex-col gap-1">
            <span className="font-semibold">{done.title}</span>
            {done.body && <span className="text-foreground">{done.body}</span>}
          </span>
        </Alert>
      )}
    </div>
  );
}
