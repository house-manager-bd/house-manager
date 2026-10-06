import { SUPABASE_URL } from "@/lib/supabase/env";

/** Plan FR11: an ad needs 4 to 8 photos. The database enforces the same numbers. */
export const MIN_PHOTOS = 4;
export const MAX_PHOTOS = 8;

export const LISTING_PHOTOS_BUCKET = "listing-photos";

/** Longest side after browser compression (plan section 2). */
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_QUALITY = 0.8;

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
