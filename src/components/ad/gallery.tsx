"use client";

import { ChevronLeft, ChevronRight, Expand, ImageOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type GalleryPhoto = { url: string; width: number | null; height: number | null };

/**
 * Photo gallery for the ad page: one large photo with arrows, swipe and
 * thumbnails, and a full-screen view. The first photo is the cover.
 */
export function Gallery({ photos, title }: { photos: GalleryPhoto[]; title: string }) {
  const t = useTranslations("AdPage");
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<number | null>(null);
  const count = photos.length;

  if (count === 0) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border bg-muted text-muted-foreground sm:aspect-[16/9]">
        <ImageOff className="size-8" aria-hidden />
        <p className="text-sm">{t("noPhotos")}</p>
      </div>
    );
  }

  const go = (by: number) => setIndex((i) => (i + by + count) % count);
  const alt = (i: number) => t("photoAlt", { number: i + 1, total: count, title });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  };
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      touchStart.current = e.touches[0].clientX;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchStart.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStart.current;
      touchStart.current = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    },
  };

  const arrows = (dark: boolean) =>
    count > 1 && (
      <>
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={t("previousPhoto")}
          className={cn(
            "absolute top-1/2 left-2 grid size-10 -translate-y-1/2 place-items-center rounded-full shadow outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            dark ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/90 text-foreground hover:bg-white",
          )}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={t("nextPhoto")}
          className={cn(
            "absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full shadow outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            dark ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/90 text-foreground hover:bg-white",
          )}
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </>
    );

  const current = photos[index];

  return (
    <div className="flex flex-col gap-2" role="region" aria-roledescription="carousel" aria-label={t("photos")}>
      <div
        className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted sm:aspect-[16/10]"
        onKeyDown={onKeyDown}
        {...swipe}
      >
        {/* Served straight from Supabase Storage (already compressed). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={alt(index)}
          width={current.width ?? undefined}
          height={current.height ?? undefined}
          className="size-full object-cover"
          fetchPriority={index === 0 ? "high" : undefined}
        />
        {arrows(false)}
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white outline-none hover:bg-black/75 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Expand className="size-3.5" aria-hidden />
          {t("photoCounter", { number: index + 1, total: count })}
        </button>
      </div>

      {count > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo, i) => (
            <li key={photo.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={alt(i)}
                aria-current={i === index ? "true" : undefined}
                className={cn(
                  "block h-14 w-20 overflow-hidden rounded-md border-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-16 sm:w-24",
                  i === index ? "border-primary" : "border-transparent opacity-80 hover:opacity-100",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="size-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        aria-label={t("photos")}
        onKeyDown={onKeyDown}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black/90"
      >
        <div className="relative flex size-full items-center justify-center" {...swipe}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt={alt(index)} className="max-h-full max-w-full object-contain" />
          {arrows(true)}
          <p className="absolute top-3 left-4 text-sm" aria-live="polite">
            {t("photoCounter", { number: index + 1, total: count })}
          </p>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t("closePhotos")}
            className="absolute top-2 right-2 grid size-10 place-items-center rounded-full bg-white/15 outline-none hover:bg-white/25 focus-visible:ring-[3px] focus-visible:ring-white/60"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </dialog>
    </div>
  );
}
