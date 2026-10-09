"use client";

import { ArrowLeft, ArrowRight, ImagePlus, Info, LoaderCircle, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { addListingPhoto, removeListingPhoto, reorderListingPhotos } from "@/lib/actions/photos";
import type { ErrorKey } from "@/lib/actions/result";
import { ACCEPTED_IMAGE_TYPES, MAX_SOURCE_BYTES, compressImageWithSize, sha256Hex } from "@/lib/images/compress";
import {
  LISTING_PHOTOS_BUCKET,
  MAX_PHOTOS,
  MIN_PHOTOS,
  PHOTO_MAX_SIDE,
  PHOTO_QUALITY,
  photoUrl,
  type ListingPhoto,
} from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";
import { StepActions, wantsExit } from "./step-shell";

type Upload = { key: string; preview: string };

export function PhotosStep({
  listingId,
  userId,
  initialPhotos,
}: {
  listingId: string;
  userId: string;
  initialPhotos: ListingPhoto[];
}) {
  const t = useTranslations("Photos");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const uploading = uploads.length > 0;
  const busy = uploading || pending;
  const total = photos.length + uploads.length;

  // Free the preview images still open when the step closes.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const open = previews.current;
    return () => open.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function uploadOne(file: File, upload: Upload): Promise<ErrorKey | null> {
    try {
      const hash = await sha256Hex(file);
      const { blob, width, height } = await compressImageWithSize(file, {
        maxSize: PHOTO_MAX_SIDE,
        quality: PHOTO_QUALITY,
      });
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${listingId}/${crypto.randomUUID()}.${ext}`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(LISTING_PHOTOS_BUCKET)
        .upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
      if (uploadError) return "uploadFailed";

      const result = await addListingPhoto({ listingId, path, width, height, hash });
      if (!result.ok) return result.error;
      setPhotos((prev) => [...prev, { id: result.data.id, storage_path: path, width, height }]);
      return null;
    } catch {
      return "uploadFailed";
    } finally {
      URL.revokeObjectURL(upload.preview);
      previews.current.delete(upload.preview);
      setUploads((prev) => prev.filter((u) => u.key !== upload.key));
    }
  }

  async function handleFiles(fileList: FileList | File[]) {
    setError(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const room = MAX_PHOTOS - total;
    if (room <= 0) return setError("photoLimit");

    const valid: File[] = [];
    let problem: ErrorKey | null = files.length > room ? "photoLimit" : null;
    for (const file of files.slice(0, room)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) problem = "imageType";
      else if (file.size > MAX_SOURCE_BYTES) problem = "imageTooLarge";
      else valid.push(file);
    }

    const batch = valid.map((file) => ({ key: crypto.randomUUID(), preview: URL.createObjectURL(file) }));
    batch.forEach((u) => previews.current.add(u.preview));
    setUploads((prev) => [...prev, ...batch]);

    // One at a time keeps memory low on phones and keeps the order the
    // person chose.
    for (let i = 0; i < valid.length; i++) {
      const failed = await uploadOne(valid[i], batch[i]);
      if (failed) problem = failed;
    }
    setError(problem);
  }

  function saveOrder(next: ListingPhoto[]) {
    const previous = photos;
    setError(null);
    setPhotos(next);
    startTransition(async () => {
      const result = await reorderListingPhotos(
        listingId,
        next.map((p) => p.id),
      );
      if (!result.ok) {
        setPhotos(previous);
        setError(result.error);
      }
    });
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    saveOrder(next);
  }

  function makeCover(index: number) {
    const next = [...photos];
    const [chosen] = next.splice(index, 1);
    saveOrder([chosen, ...next]);
  }

  function remove(photo: ListingPhoto) {
    if (!window.confirm(t("deleteConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const result = await removeListingPhoto(photo.id);
      if (!result.ok) return setError(result.error);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const exit = wantsExit(event);
    if (exit) return router.push("/dashboard/ads?saved=1");
    if (photos.length < MIN_PHOTOS) return setError("photosMin");
    router.push(`/post/${listingId}?step=7`);
  }

  const needed = Math.max(0, MIN_PHOTOS - photos.length);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium" aria-live="polite">
          {t("count", { count: photos.length, max: MAX_PHOTOS })}
        </p>
        <p className={cn("text-sm", needed > 0 ? "text-amber-800" : "text-muted-foreground")}>
          {needed > 0 ? t("needMore", { count: needed }) : t("enough")}
        </p>
      </div>

      <FormError error={error} />

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <li key={photo.id} className="flex flex-col gap-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
              {/* Served straight from Supabase Storage (already compressed). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl(photo.storage_path)}
                alt={t("photoAlt", { number: index + 1 })}
                width={photo.width ?? undefined}
                height={photo.height ?? undefined}
                className="size-full object-cover"
                loading="lazy"
              />
              {index === 0 && (
                <Badge variant="success" className="absolute top-2 left-2 shadow-sm">
                  <Star className="size-3 fill-current" aria-hidden />
                  {t("cover")}
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={t("moveEarlier", { number: index + 1 })}
                >
                  <ArrowLeft aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={busy || index === photos.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={t("moveLater", { number: index + 1 })}
                >
                  <ArrowRight aria-hidden />
                </Button>
                {index > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    disabled={busy}
                    onClick={() => makeCover(index)}
                    aria-label={t("makeCover", { number: index + 1 })}
                    title={t("makeCoverShort")}
                  >
                    <Star aria-hidden />
                  </Button>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => remove(photo)}
                aria-label={t("delete", { number: index + 1 })}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          </li>
        ))}

        {uploads.map((upload) => (
          <li key={upload.key} className="flex flex-col gap-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={upload.preview} alt="" className="size-full object-cover opacity-50" />
              <span className="absolute inset-0 grid place-items-center">
                <LoaderCircle className="size-7 animate-spin text-primary" aria-hidden />
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t("uploading")}</p>
          </li>
        ))}

        {total < MAX_PHOTOS && (
          <li>
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!uploading) void handleFiles(e.dataTransfer.files);
              }}
              className={cn(
                "flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-center text-sm text-muted-foreground transition-colors outline-none hover:border-primary hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
                dragOver && "border-primary bg-primary/5 text-primary",
              )}
            >
              <ImagePlus className="size-7" aria-hidden />
              <span className="font-medium">{t("add")}</span>
              <span className="text-xs">{t("addHint")}</span>
            </button>
          </li>
        )}
      </ul>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label={t("add")}
        onChange={(e) => {
          const files = e.target.files;
          if (files) void handleFiles(files);
          e.target.value = ""; // Allow choosing the same files again.
        }}
      />

      <Alert>
        <Info aria-hidden />
        <span className="flex flex-col gap-1.5">
          <span className="font-medium text-foreground">{t("tipsTitle")}</span>
          <ul className="list-disc space-y-1 ps-4 text-muted-foreground">
            <li>{t("tip1")}</li>
            <li>{t("tip2")}</li>
            <li>{t("tip3")}</li>
            <li>{t("tip4")}</li>
          </ul>
        </span>
      </Alert>

      <StepActions backHref={`/post/${listingId}?step=5`} pending={busy} />
    </form>
  );
}
