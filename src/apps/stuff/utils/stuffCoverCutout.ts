/**
 * Post-process background-removed Stuff covers so they sit shelf-ready:
 * trim excess transparent padding so CSS object-contain can scale the
 * subject to fill the cover stage height.
 *
 * Also provides display-time alpha detection so transparent PNG/WebP
 * covers render as cutouts without an explicit `coverPresentation` flag.
 */

const ALPHA_OPAQUE_THRESHOLD = 8;
/** Treat alpha below this as "has transparency" (allows near-opaque JPEG noise). */
const ALPHA_TRANSPARENT_CEILING = 250;
/** Small pad so anti-aliased edges aren't clipped after trim. */
const TRIM_PADDING_PX = 2;
/** Downscale probe size — enough to catch real cutouts, cheap to sample. */
const TRANSPARENCY_PROBE_SIZE = 64;

/** Cache key → has meaningful transparency. Cleared when cover bytes change. */
const transparencyCache = new Map<string, boolean>();
const transparencyInflight = new Map<string, Promise<boolean>>();

export interface AlphaBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * True when pixel data has both opaque subject pixels and transparent
 * (or semi-transparent) pixels — i.e. a real cutout, not a solid JPEG.
 */
export function imageDataHasCutoutTransparency(
  data: Uint8ClampedArray | Uint8Array,
  options?: {
    opaqueThreshold?: number;
    transparentCeiling?: number;
  }
): boolean {
  const opaqueThreshold = options?.opaqueThreshold ?? ALPHA_OPAQUE_THRESHOLD;
  const transparentCeiling =
    options?.transparentCeiling ?? ALPHA_TRANSPARENT_CEILING;

  let hasOpaque = false;
  let hasTransparent = false;

  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i]!;
    if (alpha > opaqueThreshold) hasOpaque = true;
    if (alpha < transparentCeiling) hasTransparent = true;
    if (hasOpaque && hasTransparent) return true;
  }

  return false;
}

/** Cached result for a cover cache key, if already probed. */
export function getCachedCoverTransparency(
  cacheKey: string
): boolean | undefined {
  if (!cacheKey) return undefined;
  return transparencyCache.get(cacheKey);
}

/** Drop cached probes when cover bytes are replaced or deleted. */
export function invalidateCoverTransparencyCache(cacheKey?: string): void {
  if (cacheKey) {
    transparencyCache.delete(cacheKey);
    transparencyInflight.delete(cacheKey);
    return;
  }
  transparencyCache.clear();
  transparencyInflight.clear();
}

/**
 * Formats that cannot carry alpha — skip canvas probe.
 * Data URLs and remote paths ending in .jpg/.jpeg are treated as opaque.
 */
export function coverSrcMayHaveAlpha(src: string): boolean {
  const trimmed = src.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:image/jpeg") || trimmed.startsWith("data:image/jpg")) {
    return false;
  }
  if (trimmed.startsWith("data:image/gif")) {
    // GIF can have 1-bit transparency, but Stuff covers are PNG/WebP cutouts.
    return false;
  }
  // Path / query query: opaque raster extensions.
  const path = trimmed.split("?")[0] ?? trimmed;
  if (/\.(jpe?g|gif)$/i.test(path)) return false;
  return true;
}

/**
 * Decode `src` and probe for cutout-style transparency.
 * Results are cached by `cacheKey` (prefer coverBlobId). Remote URLs use
 * `crossOrigin="anonymous"`; CORS failures return false (stay boxed).
 */
export async function detectCoverImageTransparency(
  src: string,
  cacheKey?: string
): Promise<boolean> {
  const key = (cacheKey || src).trim();
  if (!src.trim()) return false;

  if (key) {
    const cached = transparencyCache.get(key);
    if (cached !== undefined) return cached;
    const inflight = transparencyInflight.get(key);
    if (inflight) return inflight;
  }

  const probe = (async (): Promise<boolean> => {
    if (!coverSrcMayHaveAlpha(src)) return false;
    if (typeof document === "undefined") return false;

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        // Needed to read pixels from hotlinked covers when the CDN allows CORS.
        if (!src.startsWith("data:") && !src.startsWith("blob:")) {
          img.crossOrigin = "anonymous";
        }
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to decode cover for alpha probe"));
        img.src = src;
      });

      const naturalW = image.naturalWidth;
      const naturalH = image.naturalHeight;
      if (naturalW <= 0 || naturalH <= 0) return false;

      const scale = Math.min(
        1,
        TRANSPARENCY_PROBE_SIZE / Math.max(naturalW, naturalH)
      );
      const width = Math.max(1, Math.round(naturalW * scale));
      const height = Math.max(1, Math.round(naturalH * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return false;

      ctx.drawImage(image, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      return imageDataHasCutoutTransparency(data);
    } catch {
      // Tainted canvas / decode failure — keep framed presentation.
      return false;
    }
  })();

  if (key) {
    transparencyInflight.set(key, probe);
  }

  try {
    const result = await probe;
    if (key) transparencyCache.set(key, result);
    return result;
  } finally {
    if (key) transparencyInflight.delete(key);
  }
}

/**
 * Find the axis-aligned bounding box of non-transparent pixels.
 * Returns null when the image is fully transparent.
 */
export function findOpaqueAlphaBounds(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  alphaThreshold = ALPHA_OPAQUE_THRESHOLD
): AlphaBounds | null {
  if (width <= 0 || height <= 0) return null;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3]! > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

function expandBounds(
  bounds: AlphaBounds,
  width: number,
  height: number,
  padding: number
): AlphaBounds {
  return {
    minX: Math.max(0, bounds.minX - padding),
    minY: Math.max(0, bounds.minY - padding),
    maxX: Math.min(width - 1, bounds.maxX + padding),
    maxY: Math.min(height - 1, bounds.maxY + padding),
  };
}

/**
 * Trim transparent padding from a cutout PNG/WebP.
 * Returns the original blob when trim isn't needed or isn't possible.
 */
export async function trimStuffCutoutTransparentPadding(
  input: Blob
): Promise<Blob> {
  if (!(input instanceof Blob) || input.size === 0) {
    return input;
  }

  if (typeof document === "undefined") {
    return input;
  }

  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;
  let source: CanvasImageSource;
  let width: number;
  let height: number;

  try {
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(input);
      source = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } else {
      objectUrl = URL.createObjectURL(input);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to decode cutout image"));
        img.src = objectUrl!;
      });
      source = image;
      width = image.naturalWidth;
      height = image.naturalHeight;
    }

    if (width <= 0 || height <= 0) return input;

    const probe = document.createElement("canvas");
    probe.width = width;
    probe.height = height;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    if (!probeCtx) return input;

    probeCtx.drawImage(source, 0, 0);
    const { data } = probeCtx.getImageData(0, 0, width, height);
    const bounds = findOpaqueAlphaBounds(data, width, height);
    if (!bounds) return input;

    const padded = expandBounds(bounds, width, height, TRIM_PADDING_PX);
    const cropW = padded.maxX - padded.minX + 1;
    const cropH = padded.maxY - padded.minY + 1;

    // Already tight enough — skip re-encode.
    if (cropW >= width - TRIM_PADDING_PX * 2 && cropH >= height - TRIM_PADDING_PX * 2) {
      return input;
    }

    const out = document.createElement("canvas");
    out.width = cropW;
    out.height = cropH;
    const outCtx = out.getContext("2d");
    if (!outCtx) return input;

    outCtx.drawImage(
      source,
      padded.minX,
      padded.minY,
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      out.toBlob((result) => resolve(result), "image/png");
    });
    return blob && blob.size > 0 ? blob : input;
  } catch {
    return input;
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
