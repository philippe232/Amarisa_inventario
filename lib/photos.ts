export const PHOTO_BUCKET = "item-photos";

// File names are random UUIDs and never reused, so a photo's bytes never
// change: let browsers keep them for a year instead of re-downloading
// (Supabase's default is one hour).
export const PHOTO_CACHE_CONTROL = "31536000";

export type PhotoSizes = { url: string; thumb_url?: string | null; md_url?: string | null };

// Thumbnails and list rows: the smallest copy that exists.
export const thumbUrl = (p: PhotoSizes): string => p.thumb_url ?? p.md_url ?? p.url;
// Article page and full-size viewer: the medium copy, else the original.
export const viewUrl = (p: PhotoSizes): string => p.md_url ?? p.url;

// "<item id>/<file>.jpg" inside the bucket, from a public URL.
export function storagePath(publicUrl: string): string | null {
  return publicUrl.split(`/${PHOTO_BUCKET}/`)[1] ?? null;
}

// Longest side and JPEG quality for each copy. The stored "full" version is
// capped at 2000px — plenty for a catalog, and a fraction of camera size.
const SIZES = {
  full: { side: 2000, quality: 0.85 },
  md: { side: 1280, quality: 0.8 },
  thumb: { side: 320, quality: 0.75 },
} as const;

async function toBitmap(file: File): Promise<ImageBitmap> {
  try {
    // Honor the EXIF rotation phones write instead of the pixel order.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(file);
  }
}

function scaled(bitmap: ImageBitmap, side: number, quality: number): Promise<Blob> {
  const ratio = Math.min(1, side / Math.max(bitmap.width, bitmap.height)); // never upscale
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen."))), "image/jpeg", quality),
  );
}

// The three JPEG copies of an uploaded photo, made in the browser before
// anything is sent.
export async function makePhotoVariants(file: File): Promise<{ full: Blob; md: Blob; thumb: Blob }> {
  const bitmap = await toBitmap(file);
  try {
    const full = await scaled(bitmap, SIZES.full.side, SIZES.full.quality);
    const md = await scaled(bitmap, SIZES.md.side, SIZES.md.quality);
    const thumb = await scaled(bitmap, SIZES.thumb.side, SIZES.thumb.quality);
    return { full, md, thumb };
  } finally {
    bitmap.close();
  }
}
