/** Perceived luminance (0..1) — same weights as `readableText` in accents.ts. */
export function wallpaperLuminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export type MenubarTextTone = "light" | "dark";

export const MENUBAR_LUMINANCE_THRESHOLD = 0.62;

export function menubarTextToneForLuminance(luminance: number): MenubarTextTone {
  return luminance > MENUBAR_LUMINANCE_THRESHOLD ? "dark" : "light";
}

export function menubarTextColorForLuminance(luminance: number): string {
  return menubarTextToneForLuminance(luminance) === "dark" ? "#000000" : "#f4f4f5";
}

export function menubarTextForTone(tone: MenubarTextTone): string {
  return tone === "dark" ? "#000000" : "#f4f4f5";
}

/**
 * Average luminance of the wallpaper strip behind the menubar (top ~15% of the
 * image). Reuses the same canvas sampling approach as `useCoverPalette`.
 */
export function sampleWallpaperTopLuminance(img: HTMLImageElement): number {
  const canvas = document.createElement("canvas");
  const width = 64;
  const height = 8;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx || img.naturalWidth === 0 || img.naturalHeight === 0) {
    return 0.5;
  }

  const sourceHeight = Math.max(1, img.naturalHeight * 0.15);
  ctx.drawImage(img, 0, 0, img.naturalWidth, sourceHeight, 0, 0, width, height);

  const data = ctx.getImageData(0, 0, width, height).data;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 255;
    if (alpha < 128) continue;
    rSum += data[i]!;
    gSum += data[i + 1]!;
    bSum += data[i + 2]!;
    count++;
  }

  if (count === 0) return 0.5;
  return wallpaperLuminance(rSum / count, gSum / count, bSum / count);
}
