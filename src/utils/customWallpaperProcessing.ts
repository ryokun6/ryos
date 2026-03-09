export const CUSTOM_WALLPAPER_TARGET_WIDTH = 1920;
export const CUSTOM_WALLPAPER_TARGET_HEIGHT = 1080;
export const CUSTOM_WALLPAPER_MIME_TYPE = "image/jpeg";
export const CUSTOM_WALLPAPER_JPEG_QUALITY = 0.9;

export interface DecodedWallpaperImage {
  source: unknown;
  width: number;
  height: number;
  cleanup?: () => void;
}

export interface WallpaperCanvasContext {
  fillStyle: string;
  fillRect: (x: number, y: number, width: number, height: number) => void;
  drawImage: (
    source: unknown,
    dx: number,
    dy: number,
    dWidth: number,
    dHeight: number
  ) => void;
}

export interface WallpaperCanvas {
  toBlob: (
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number
  ) => void;
}

export interface WallpaperCanvasHandle {
  canvas: WallpaperCanvas;
  context: WallpaperCanvasContext;
}

interface WallpaperProcessingDeps {
  loadImage?: (file: Blob) => Promise<DecodedWallpaperImage>;
  createCanvas?: (width: number, height: number) => WallpaperCanvasHandle;
  createFile?: (blob: Blob, name: string, options: FilePropertyBag) => File;
}

export interface WallpaperCoverPlacement {
  offsetX: number;
  offsetY: number;
  drawWidth: number;
  drawHeight: number;
}

export function calculateWallpaperCoverPlacement(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth = CUSTOM_WALLPAPER_TARGET_WIDTH,
  targetHeight = CUSTOM_WALLPAPER_TARGET_HEIGHT
): WallpaperCoverPlacement {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Wallpaper source dimensions must be greater than zero");
  }

  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;

  return {
    offsetX: (targetWidth - drawWidth) / 2,
    offsetY: (targetHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
  };
}

export function buildCustomWallpaperFilename(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const sanitizedBase = withoutExtension
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${sanitizedBase || "custom_wallpaper"}.jpg`;
}

const defaultCreateCanvas = (
  width: number,
  height: number
): WallpaperCanvasHandle => {
  if (typeof document === "undefined") {
    throw new Error("Canvas processing is unavailable in this environment");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to initialize wallpaper canvas context");
  }

  return {
    canvas,
    context: {
      get fillStyle() {
        return String(context.fillStyle);
      },
      set fillStyle(value: string) {
        context.fillStyle = value;
      },
      fillRect: (x, y, w, h) => context.fillRect(x, y, w, h),
      drawImage: (source, dx, dy, dWidth, dHeight) =>
        context.drawImage(source as CanvasImageSource, dx, dy, dWidth, dHeight),
    },
  };
};

const defaultLoadImage = async (file: Blob): Promise<DecodedWallpaperImage> => {
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
  return await new Promise<DecodedWallpaperImage>((resolve, reject) => {
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
      reject(new Error("Failed to decode wallpaper image"));
    };
    image.src = objectUrl;
  });
};

const blobToJpeg = async (canvas: WallpaperCanvas): Promise<Blob> =>
  await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode wallpaper as JPEG"));
          return;
        }
        resolve(blob);
      },
      CUSTOM_WALLPAPER_MIME_TYPE,
      CUSTOM_WALLPAPER_JPEG_QUALITY
    );
  });

export async function convertImageFileToWallpaperJpeg(
  file: File,
  deps: WallpaperProcessingDeps = {}
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files allowed");
  }

  const loadImage = deps.loadImage ?? defaultLoadImage;
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas;
  const createFile =
    deps.createFile ??
    ((blob, name, options) => new File([blob], name, options));

  const image = await loadImage(file);

  try {
    const { canvas, context } = createCanvas(
      CUSTOM_WALLPAPER_TARGET_WIDTH,
      CUSTOM_WALLPAPER_TARGET_HEIGHT
    );
    const placement = calculateWallpaperCoverPlacement(image.width, image.height);

    context.fillStyle = "#000000";
    context.fillRect(
      0,
      0,
      CUSTOM_WALLPAPER_TARGET_WIDTH,
      CUSTOM_WALLPAPER_TARGET_HEIGHT
    );
    context.drawImage(
      image.source,
      placement.offsetX,
      placement.offsetY,
      placement.drawWidth,
      placement.drawHeight
    );

    const blob = await blobToJpeg(canvas);
    return createFile(blob, buildCustomWallpaperFilename(file.name), {
      type: CUSTOM_WALLPAPER_MIME_TYPE,
      lastModified: file.lastModified,
    });
  } finally {
    image.cleanup?.();
  }
}
