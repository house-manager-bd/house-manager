"use server";

import { createClient } from "@/lib/supabase/server";
import { LISTING_PHOTOS_BUCKET } from "@/lib/photos";
import { addPhotoSchema, photoIdSchema, reorderPhotosSchema, type AddPhotoInput } from "@/lib/validation/photo";
import { dbErrorKey, type ActionResult } from "./result";

/**
 * Records a photo the browser has just uploaded to storage. The database
 * checks the poster, the draft status, the 8 photo limit, that the file
 * exists in the poster's folder, and duplicates within the ad.
 */
export async function addListingPhoto(input: AddPhotoInput): Promise<ActionResult<{ id: string }>> {
  const parsed = addPhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "uploadFailed" };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_listing_photo", {
    p_listing_id: v.listingId,
    p_path: v.path,
    p_width: v.width,
    p_height: v.height,
    p_hash: v.hash,
  });
  if (error || !data) {
    // The row was not saved, so the uploaded file is not needed.
    await supabase.storage.from(LISTING_PHOTOS_BUCKET).remove([v.path]);
    return { ok: false, error: dbErrorKey(error) };
  }
  return { ok: true, data: { id: data } };
}

export async function removeListingPhoto(photoId: string): Promise<ActionResult> {
  if (!photoIdSchema.safeParse(photoId).success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("remove_listing_photo", { p_photo_id: photoId });
  if (error) return { ok: false, error: dbErrorKey(error) };
  // A file left behind is harmless (it is no longer linked to the ad), so a
  // storage error does not fail the action.
  if (path) await supabase.storage.from(LISTING_PHOTOS_BUCKET).remove([path]);
  return { ok: true };
}

/** Saves a new photo order. The first photo becomes the cover. */
export async function reorderListingPhotos(listingId: string, photoIds: string[]): Promise<ActionResult> {
  const parsed = reorderPhotosSchema.safeParse({ listingId, photoIds });
  if (!parsed.success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_listing_photos", {
    p_listing_id: parsed.data.listingId,
    p_photo_ids: parsed.data.photoIds,
  });
  if (error) return { ok: false, error: dbErrorKey(error) };
  return { ok: true };
}
