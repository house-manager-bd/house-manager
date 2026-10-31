"use client";

import { BadgeCheck, Camera, ImageUp, LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { acceptOffer } from "@/lib/actions/offer";
import type { ErrorKey } from "@/lib/actions/result";
import { ACCEPTED_IMAGE_TYPES, MAX_SOURCE_BYTES, compressImageWithSize } from "@/lib/images/compress";
import { createClient } from "@/lib/supabase/client";
import {
  acceptDetailsSchema,
  ADDRESS_MAX,
  TENANT_DOCS_BUCKET,
  TENANT_PHOTO_MAX_SIDE,
  TENANT_PHOTO_QUALITY,
} from "@/lib/validation/offer";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/auth/form-alert";
import { FormField, fieldAria } from "@/components/auth/form-field";

type Field = "nid" | "permanentAddress" | "consent" | "photo";

/**
 * The seeker accepts an offer (FR27): NID number, a current photo, the
 * permanent address and a consent tick (plan section 1.5). The photo is
 * shrunk in the browser and uploaded to the private bucket; the NID number
 * goes to the server, which encrypts it before saving. The database then
 * creates the tenancy (accept_offer).
 */
export function AcceptForm({
  requestId,
  userId,
  landlordName,
  returnTo,
}: {
  requestId: string;
  userId: string;
  landlordName: string;
  returnTo: string;
}) {
  const t = useTranslations("Offer");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [nid, setNid] = useState("");
  const [permanentAddress, setPermanentAddress] = useState("");
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, ErrorKey>>>({});
  const [error, setError] = useState<ErrorKey | null>(null);
  const [step, setStep] = useState<"idle" | "uploading" | "saving">("idle");
  const [, startTransition] = useTransition();
  const busy = step !== "idle";

  useEffect(() => {
    if (open) formRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <BadgeCheck aria-hidden />
        {t("accept")}
      </Button>
    );
  }

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return setErrors((e) => ({ ...e, photo: "imageType" }));
    if (file.size > MAX_SOURCE_BYTES) return setErrors((e) => ({ ...e, photo: "imageTooLarge" }));
    setErrors((e) => ({ ...e, photo: undefined }));
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = acceptDetailsSchema.safeParse({ nid, permanentAddress, consent });
    const next: Partial<Record<Field, ErrorKey>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Field;
        if (!next[key]) next[key] = issue.message as ErrorKey;
      }
    }
    if (!photo) next.photo = "photoMissing";
    setErrors(next);
    if (Object.keys(next).length || !photo) return;

    // 1. The photo, shrunk to about 100 KB, into the private bucket.
    setStep("uploading");
    let photoPath: string;
    try {
      const { blob } = await compressImageWithSize(photo, {
        maxSize: TENANT_PHOTO_MAX_SIDE,
        quality: TENANT_PHOTO_QUALITY,
      });
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      photoPath = `${userId}/${requestId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await createClient()
        .storage.from(TENANT_DOCS_BUCKET)
        .upload(photoPath, blob, { contentType: blob.type, upsert: false });
      if (uploadError) throw uploadError;
    } catch {
      setStep("idle");
      setError("uploadFailed");
      return;
    }

    // 2. The server encrypts the NID number and the database creates the tenancy.
    setStep("saving");
    const result = await acceptOffer({ requestId, nid, permanentAddress, consent, photoPath });
    if (!result.ok) {
      setStep("idle");
      const fields = result.fieldErrors as Partial<Record<Field, ErrorKey>> | undefined;
      if (fields && Object.keys(fields).length) setErrors(fields);
      else if (result.error === "nidInvalid") setErrors({ nid: result.error });
      else if (result.error === "addressInvalid") setErrors({ permanentAddress: result.error });
      else if (result.error === "consentRequired") setErrors({ consent: result.error });
      else if (result.error === "photoMissing") setErrors({ photo: result.error });
      else setError(result.error);
      // The offer may have run out or been taken back meanwhile.
      if (result.error === "offerExpired" || result.error === "requestChanged") startTransition(() => router.refresh());
      return;
    }
    // The action revalidated; no router.refresh, it would cancel this navigation.
    router.replace(`${returnTo}?done=accepted`, { scroll: false });
  }

  const photoHintId = `${id}-photo-hint`;

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="flex w-full scroll-mt-24 flex-col gap-4 rounded-lg border border-primary/30 bg-background p-4"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{t("acceptTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("acceptBody", { name: landlordName })}</p>
      </div>

      <FormField id={`${id}-nid`} label={t("nid")} error={errors.nid} hint={t("nidHint")}>
        <Input
          {...fieldAria(`${id}-nid`, errors.nid, t("nidHint"))}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={nid}
          onChange={(e) => setNid(e.target.value)}
          maxLength={30}
          className="max-w-64"
        />
      </FormField>

      <div className="flex flex-col gap-2">
        <span id={`${id}-photo-label`} className="text-sm font-medium">
          {t("photo")}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={t("photoPreview")} className="size-24 rounded-lg border object-cover" />
          ) : (
            <span className="grid size-24 place-items-center rounded-lg border border-dashed bg-muted text-muted-foreground">
              <Camera className="size-6" aria-hidden />
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="sr-only"
            aria-labelledby={`${id}-photo-label`}
            aria-describedby={errors.photo ? `${id}-photo-error` : photoHintId}
            onChange={(e) => {
              pickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
            disabled={busy}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <ImageUp aria-hidden />
            {photo ? t("photoChange") : t("photoChoose")}
          </Button>
        </div>
        {errors.photo ? (
          <p id={`${id}-photo-error`} className="text-sm text-destructive">
            <ErrorText error={errors.photo} />
          </p>
        ) : (
          <p id={photoHintId} className="text-xs text-muted-foreground">
            {t("photoHint")}
          </p>
        )}
      </div>

      <FormField id={`${id}-address`} label={t("permanentAddress")} error={errors.permanentAddress} hint={t("addressHint")}>
        <Textarea
          {...fieldAria(`${id}-address`, errors.permanentAddress, t("addressHint"))}
          value={permanentAddress}
          onChange={(e) => setPermanentAddress(e.target.value)}
          maxLength={ADDRESS_MAX}
          rows={3}
          autoComplete="off"
        />
      </FormField>

      <div className="flex flex-col gap-2">
        <CheckboxField
          label={t("consent", { name: landlordName })}
          hint={t("consentHint")}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          aria-invalid={errors.consent ? true : undefined}
          aria-describedby={errors.consent ? `${id}-consent-error` : undefined}
          className={errors.consent ? "border-destructive" : undefined}
          disabled={busy}
        />
        {errors.consent && (
          <p id={`${id}-consent-error`} className="text-sm text-destructive">
            <ErrorText error={errors.consent} />
          </p>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <LockKeyhole className="mt-px size-3.5 shrink-0" aria-hidden />
        {t("privacyNote")}
      </p>
      <FormError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={busy}>
          <BadgeCheck aria-hidden />
          {step === "uploading" ? t("uploading") : step === "saving" ? t("confirming") : t("confirm")}
        </Button>
      </div>
    </form>
  );
}

function ErrorText({ error }: { error: ErrorKey }) {
  const t = useTranslations("Errors");
  return <>{t(error)}</>;
}
