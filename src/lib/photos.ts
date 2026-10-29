import { SUPABASE_URL } from "@/lib/supabase/env";

/** Plan FR11: an ad needs 4 to 8 photos. The database enforces the same numbers. */
export const MIN_PHOTOS = 4;
export const MAX_PHOTOS = 8;

export const LISTING_PHOTOS_BUCKET = "listing-photos";

/** Longest side after browser compression (plan section 2). */
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_QUALITY = 0.8;

/**
 * F5: photos whose shorter side is under 600 px look blurry on the ad page
 * and on search cards. A photo big enough to be shrunk to 1600 px is always
 * fine (a wide panorama, for example). add_listing_photo() in the database
 * checks the same rule.
 */
export const PHOTO_MIN_SHORT_SIDE = 600;

/** Checks the size after compression (the size that is saved). */
export function isPhotoTooSmall(width: number, height: number) {
  return Math.min(width, height) < PHOTO_MIN_SHORT_SIDE && Math.max(width, height) < PHOTO_MAX_SIDE;
}

export type ListingPhoto = {
  id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
};

/**
 * Public URL of a listing photo. The bucket is public, so the URL can be
 * built without a request (same format as storage.getPublicUrl).
 */
export function photoUrl(path: string) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${LISTING_PHOTOS_BUCKET}/${encoded}`;
}
