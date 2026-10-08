export const FOOD_PHOTO_MAX_EDGE = 1024;
export const FOOD_THUMBNAIL_EDGE = 96;

/** Scale (w, h) to fit inside `maxEdge` while keeping the aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall back to <img> decoding (e.g. HEIC on Safari).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderJpeg(
  source: ImageBitmap | HTMLImageElement,
  maxEdge: number,
  quality: number
): string {
  const srcWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
  const { width, height } = fitWithin(srcWidth, srcHeight, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export interface PreparedFoodPhoto {
  /** Base64 JPEG (no data: prefix) sent to the AI endpoint. */
  base64: string;
  /** Full-size preview data URL. */
  previewUrl: string;
  /** Tiny data URL saved with the log entry. */
  thumbnailUrl: string;
}

/** Downscale a camera/photo file to a ≤1024px JPEG plus a 96px thumbnail. */
export async function prepareFoodPhoto(file: Blob): Promise<PreparedFoodPhoto> {
  const bitmap = await loadBitmap(file);
  try {
    const previewUrl = renderJpeg(bitmap, FOOD_PHOTO_MAX_EDGE, 0.82);
    const thumbnailUrl = renderJpeg(bitmap, FOOD_THUMBNAIL_EDGE, 0.7);
    return {
      base64: previewUrl.slice(previewUrl.indexOf(",") + 1),
      previewUrl,
      thumbnailUrl,
    };
  } finally {
    if ("close" in bitmap) bitmap.close();
  }
}
