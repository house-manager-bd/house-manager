"use client";

import { Camera, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { setAvatar } from "@/lib/actions/profile";
import type { ErrorKey } from "@/lib/actions/result";
import { ACCEPTED_IMAGE_TYPES, MAX_SOURCE_BYTES, compressImage } from "@/lib/images/compress";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";
import { initials } from "@/components/layout/user-menu";

export function AvatarUpload({
  userId,
  avatarUrl,
  fullName,
  email,
}: {
  userId: string;
  avatarUrl: string | null;
  fullName: string;
  email: string;
}) {
  const t = useTranslations("Profile");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const working = busy || pending;

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // Allow choosing the same file again.
    if (!file) return;

    setError(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return setError("imageType");
    if (file.size > MAX_SOURCE_BYTES) return setError("imageTooLarge");

    setBusy(true);
    try {
      const blob = await compressImage(file, { maxSize: 400, squareCrop: true });
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const result = await setAvatar(data.publicUrl);
      if (!result.ok) throw new Error(result.error);

      setPreview(data.publicUrl);
      startTransition(() => router.refresh());
    } catch {
      setError("uploadFailed");
    } finally {
      setBusy(false);
    }
  }

  function removePhoto() {
    setError(null);
    startTransition(async () => {
      const result = await setAvatar(null);
      if (!result.ok) return setError(result.error);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Avatar className="size-20 border">
          {preview && <AvatarImage src={preview} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback className="text-xl">{initials(fullName, email)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="sr-only"
            onChange={onFileChange}
            aria-label={t("photo")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={working}
            onClick={() => inputRef.current?.click()}
          >
            <Camera aria-hidden />
            {busy ? t("uploading") : preview ? t("changePhoto") : t("uploadPhoto")}
          </Button>
          {preview && (
            <Button type="button" variant="ghost" size="sm" disabled={working} onClick={removePhoto}>
              <Trash2 aria-hidden />
              {t("removePhoto")}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("photoHint")}</p>
      <FormError error={error} />
    </div>
  );
}
