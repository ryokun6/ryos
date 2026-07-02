export const WALLPAPER_RENDER_WIDTHS = [1280, 1920, 2560] as const;
const MAX_RENDER_DPR = 2;
const MAX_DOWNSCALE_RATIO = 1.25;
const PHOTO_MARKER = "/wallpapers/photos/";

export function pickWallpaperRenderWidth(
  viewportWidth: number,
  devicePixelRatio: number,
  widths: readonly number[] = WALLPAPER_RENDER_WIDTHS
): number | null {
  if (widths.length === 0) return null;

  const safeViewportWidth = Math.max(1, viewportWidth);
  const safeDpr = Math.max(1, Math.min(MAX_RENDER_DPR, devicePixelRatio || 1));
  const targetWidth = Math.ceil(safeViewportWidth * safeDpr);
  const sortedWidths = [...widths].sort((a, b) => a - b);
  const coveringWidth = sortedWidths.find((width) => width >= targetWidth);
  if (coveringWidth) return coveringWidth;

  const largestWidth = sortedWidths.at(-1)!;
  return targetWidth <= largestWidth * MAX_DOWNSCALE_RATIO
    ? largestWidth
    : null;
}

export function isBuiltInPhotoWallpaper(source: string): boolean {
  const cleanSource = source.split(/[?#]/)[0];
  return (
    cleanSource.includes(PHOTO_MARKER) &&
    /\.(?:jpe?g|png)$/i.test(cleanSource)
  );
}

export function resolveStaticWallpaperRenderUrl(
  canonicalSource: string,
  viewportWidth: number,
  devicePixelRatio: number
): string {
  if (!isBuiltInPhotoWallpaper(canonicalSource)) {
    return canonicalSource;
  }

  const width = pickWallpaperRenderWidth(viewportWidth, devicePixelRatio);
  if (!width) {
    return canonicalSource;
  }

  const cleanSource = canonicalSource.split(/[?#]/)[0];
  const markerIndex = cleanSource.indexOf(PHOTO_MARKER);
  const originPrefix = cleanSource.slice(0, markerIndex);
  const relativePhotoPath = cleanSource
    .slice(markerIndex + "/wallpapers/".length)
    .replace(/\.[^.]+$/, "");
  return `${originPrefix}/wallpapers/variants/${width}w/${relativePhotoPath}.webp`;
}

export function resolveStaticWallpaperForCurrentViewport(
  canonicalSource: string
): string {
  return resolveStaticWallpaperRenderUrl(
    canonicalSource,
    typeof window === "undefined" ? 1920 : window.innerWidth,
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
  );
}
