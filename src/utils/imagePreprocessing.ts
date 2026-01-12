/**
 * Image preprocessing utility for resizing and compressing images
 * before sending to AI models.
 */

export interface ImagePreprocessOptions {
  /** Maximum dimension (width or height) in pixels. Default: 1280 */
  maxDimension?: number;
  /** JPEG quality (0-1). Default: 0.85 */
  quality?: number;
  /** Target format. Default: 'image/jpeg' (or 'image/png' if transparency detected) */
  format?: "image/jpeg" | "image/png" | "image/webp";
}

const DEFAULT_OPTIONS: Required<ImagePreprocessOptions> = {
  maxDimension: 1280,
  quality: 0.85,
  format: "image/jpeg",
};

/**
 * Check if an image has transparency by sampling the alpha channel
 */
function hasTransparency(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Sample every 100th pixel for performance (alpha is at index 3, 7, 11, etc.)
  for (let i = 3; i < data.length; i += 400) {
    if (data[i] < 255) {
      return true;
    }
  }
  return false;
}

/**
 * Load an image from a data URL or URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/**
 * Calculate new dimensions while maintaining aspect ratio
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number
): { width: number; height: number } {
  // If already within limits, return original dimensions
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { width: originalWidth, height: originalHeight };
  }

  // Calculate scale factor
  const scale = Math.min(
    maxDimension / originalWidth,
    maxDimension / originalHeight
  );

  return {
    width: Math.round(originalWidth * scale),
    height: Math.round(originalHeight * scale),
  };
}

/**
 * Preprocess an image by resizing and compressing it.
 *
 * @param imageDataUrl - The source image as a data URL (e.g., from FileReader.readAsDataURL)
 * @param options - Optional preprocessing options
 * @returns A promise resolving to the processed image as a data URL
 */
export async function preprocessImage(
  imageDataUrl: string,
  options?: ImagePreprocessOptions
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Load the image
  const img = await loadImage(imageDataUrl);

  // Calculate new dimensions
  const { width, height } = calculateDimensions(
    img.naturalWidth,
    img.naturalHeight,
    opts.maxDimension
  );

  // Create canvas for resizing
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // Use better quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Draw the resized image
  ctx.drawImage(img, 0, 0, width, height);

  // Determine output format - preserve PNG if image has transparency
  let outputFormat = opts.format;
  if (outputFormat === "image/jpeg") {
    // Check if original was PNG and has transparency
    const originalFormat = imageDataUrl.match(/^data:([^;]+);/)?.[1];
    if (originalFormat === "image/png" && hasTransparency(ctx, width, height)) {
      outputFormat = "image/png";
    }
  }

  // Convert to data URL with compression
  const quality = outputFormat === "image/png" ? undefined : opts.quality;
  return canvas.toDataURL(outputFormat, quality);
}

/**
 * Get the approximate size of a data URL in bytes
 */
export function getDataUrlSize(dataUrl: string): number {
  // Remove the data URL prefix to get just the base64 part
  const base64 = dataUrl.split(",")[1];
  if (!base64) return 0;

  // Base64 encoding adds ~33% overhead, so actual byte size is ~75% of base64 length
  return Math.round((base64.length * 3) / 4);
}

/**
 * Format bytes as a human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
