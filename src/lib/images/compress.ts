/**
 * Resizes an image in the browser and converts it to WebP before upload.
 * F1 uses it for avatars (square crop, 400px). F3 uses it for listing
 * photos (longest side 1600px, about 250 KB).
 */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

type Options = {
  /** Longest side in pixels, or the side of the square when squareCrop is set. */
  maxSize: number;
  quality?: number;
  squareCrop?: boolean;
};

export type CompressedImage = { blob: Blob; width: number; height: number };

/** Like compressImage, but also returns the final width and height. */
export async function compressImageWithSize(
  file: File,
  { maxSize, quality = 0.82, squareCrop = false }: Options,
): Promise<CompressedImage> {
  // "from-image" applies the phone camera's rotation, so portrait photos
  // are not saved sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;

    if (squareCrop) {
      const side = Math.min(sw, sh);
      sx = Math.round((sw - side) / 2);
      sy = Math.round((sh - side) / 2);
      sw = side;
      sh = side;
    }

    const scale = Math.min(1, maxSize / Math.max(sw, sh));
    const width = Math.round(sw * scale);
    const height = Math.round(sh * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);

    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

    // Some older Safari versions cannot encode WebP and return PNG instead.
    let blob = await encode("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg");
    if (!blob) throw new Error("Could not encode image");
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

export async function compressImage(file: File, options: Options): Promise<Blob> {
  return (await compressImageWithSize(file, options)).blob;
}

/** SHA-256 of the original file as hex, used to spot the same photo twice. */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
