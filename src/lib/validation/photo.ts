import { z } from "zod";
import { MAX_PHOTOS } from "@/lib/photos";

const uuid = z.uuid("generic");

/** What the browser sends after uploading a photo to storage. */
export const addPhotoSchema = z.object({
  listingId: uuid,
  // <user id>/<listing id>/<random id>.webp (the database checks the ids).
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/, "uploadFailed"),
  width: z.number().int().min(1).max(10000),
  height: z.number().int().min(1).max(10000),
  hash: z.string().regex(/^[0-9a-f]{64}$/, "uploadFailed"),
});

export type AddPhotoInput = z.input<typeof addPhotoSchema>;

export const reorderPhotosSchema = z.object({
  listingId: uuid,
  photoIds: z.array(uuid).min(1).max(MAX_PHOTOS),
});

export const photoIdSchema = uuid;
