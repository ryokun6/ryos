/**
 * Client-side resize + JPEG compression for Stuff cover images so oversized
 * uploads (picker / drop / paste / lookup) fit under STUFF_IMAGE_MAX_BYTES.
 */

import { STUFF_IMAGE_MAX_BYTES } from "./barcodeLookup";

export { STUFF_IMAGE_MAX_BYTES };

/** Longest edge for stored covers (keeps aspect ratio). */
export const STUFF_COVER_MAX_EDGE = 1600;

export const STUFF_COVER_MIME_TYPE = "image/jpeg";

/** Quality ladder tried after resize until the blob fits the size budget. */
export const STUFF_COVER_JPEG_QUALITIES = [0.85, 0.72, 0.6, 0.48, 0.36] as const;

/** Secondary max-edge ladder if quality alone cannot meet the budget. */
export const STUFF_COVER_EDGE_STEPS = [1600, 1200, 960, 720] as const;

export interface DecodedCoverImage {
  source: unknown;
  width: number;
  height: number;
  cleanup?: () => void;
}

export interface CoverCanvasContext {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  drawImage: (
    source: unknown,
    dx: number,
    dy: number,
    dWidth: number,
    dHeight: number
  ) => void;
}

export interface CoverCanvas {
  toBlob: (
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number
  ) => void;
}

export interface CoverCanvasHandle {
  canvas: CoverCanvas;
  context: CoverCanvasContext;
}

export interface StuffCoverCompressDeps {
  loadImage?: (file: Blob) => Promise<DecodedCoverImage>;
  createCanvas?: (width: number, height: number) => CoverCanvasHandle;
}

export interface StuffCoverOutputSize {
  width: number;
  height: number;
  shouldResize: boolean;
}

export function getStuffCoverOutputSize(
  sourceWidth: number,
  sourceHeight: number,
  maxEdge = STUFF_COVER_MAX_EDGE
): StuffCoverOutputSize {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Cover source dimensions must be greater than zero");
  }

  const longest = Math.max(sourceWidth, sourceHeight);
  if (longest <= maxEdge) {
    return {
      width: sourceWidth,
      height: sourceHeight,
      shouldResize: false,
    };
  }

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    shouldResize: true,
  };
}

const defaultCreateCanvas = (
  width: number,
  height: number
): CoverCanvasHandle => {
  if (typeof document === "undefined") {
    throw new Error("Canvas processing is unavailable in this environment");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to initialize cover canvas context");
  }

  return {
    canvas,
    context: {
      get imageSmoothingEnabled() {
        return context.imageSmoothingEnabled;
      },
      set imageSmoothingEnabled(value: boolean) {
        context.imageSmoothingEnabled = value;
      },
      get imageSmoothingQuality() {
        return context.imageSmoothingQuality;
      },
      set imageSmoothingQuality(value: ImageSmoothingQuality) {
        context.imageSmoothingQuality = value;
      },
      drawImage: (source, dx, dy, dWidth, dHeight) =>
        context.drawImage(source as CanvasImageSource, dx, dy, dWidth, dHeight),
    },
  };
};

const defaultLoadImage = async (file: Blob): Promise<DecodedCoverImage> => {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }

  if (typeof document === "undefined") {
    throw new Error("Image decoding is unavailable in this environment");
  }

  const objectUrl = URL.createObjectURL(file);
  return await new Promise<DecodedCoverImage>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode cover image"));
    };
    image.src = objectUrl;
  });
};

function canvasToJpeg(
  canvas: CoverCanvas,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode cover as JPEG"));
          return;
        }
        resolve(blob);
      },
      STUFF_COVER_MIME_TYPE,
      quality
    );
  });
}

/**
 * Resize (max edge) + JPEG-encode until under STUFF_IMAGE_MAX_BYTES.
 * Returns the original blob when it already fits.
 */
export async function prepareStuffCoverBlob(
  input: Blob,
  deps: StuffCoverCompressDeps = {}
): Promise<Blob> {
  if (!(input instanceof Blob) || input.size === 0) {
    throw new Error("Invalid Stuff cover image");
  }

  if (input.size <= STUFF_IMAGE_MAX_BYTES) {
    return input;
  }

  const loadImage = deps.loadImage ?? defaultLoadImage;
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas;
  const image = await loadImage(input);

  try {
    if (image.width <= 0 || image.height <= 0) {
      throw new Error("Invalid cover image dimensions");
    }

    for (const maxEdge of STUFF_COVER_EDGE_STEPS) {
      const { width, height } = getStuffCoverOutputSize(
        image.width,
        image.height,
        maxEdge
      );
      const { canvas, context } = createCanvas(width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image.source, 0, 0, width, height);

      for (const quality of STUFF_COVER_JPEG_QUALITIES) {
        const encoded = await canvasToJpeg(canvas, quality);
        if (encoded.size <= STUFF_IMAGE_MAX_BYTES) {
          return encoded;
        }
      }
    }

    throw new Error("Cover image exceeds size limit after compression");
  } finally {
    image.cleanup?.();
  }
}
