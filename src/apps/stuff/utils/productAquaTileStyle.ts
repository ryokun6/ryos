import type { CSSProperties } from "react";

const DARK_AQUA_TEXT = "rgba(20, 36, 48, 0.92)";
const LIGHT_AQUA_TEXT = "rgba(255, 255, 255, 0.96)";

/** Surfaces darker than this get light text (WCAG relative luminance). */
const AQUA_SURFACE_LIGHT_TEXT_LUMINANCE = 0.38;

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(normalized)) return null;
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function resolveAquaTintRgb(tintHex?: string): { r: number; g: number; b: number } {
  return (tintHex && parseHexColor(tintHex)) || { r: 33, g: 160, b: 196 };
}

/** Mid gradient stop — matches `productAquaTileStyle` 42% band. */
export function aquaTileMidGradientRgb(tintHex?: string): {
  r: number;
  g: number;
  b: number;
} {
  const { r, g, b } = resolveAquaTintRgb(tintHex);
  return {
    r: Math.min(255, r + 36),
    g: Math.min(255, g + 36),
    b: Math.min(255, b + 36),
  };
}

/** sRGB relative luminance (WCAG 2.x). */
export function relativeLuminance(r: number, g: number, b: number): number {
  const linear = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/**
 * Approximate luminance of the placeholder well area: mid gel stop composited
 * over white, then the `bg-white/35` inner well on top.
 */
export function aquaTilePlaceholderSurfaceLuminance(tintHex?: string): number {
  const mid = aquaTileMidGradientRgb(tintHex);
  const gelOnWhite = {
    r: mid.r * 0.48 + 255 * 0.52,
    g: mid.g * 0.48 + 255 * 0.52,
    b: mid.b * 0.48 + 255 * 0.52,
  };
  const wellSurface = {
    r: gelOnWhite.r * 0.65 + 255 * 0.35,
    g: gelOnWhite.g * 0.65 + 255 * 0.35,
    b: gelOnWhite.b * 0.65 + 255 * 0.35,
  };
  return relativeLuminance(wellSurface.r, wellSurface.g, wellSurface.b);
}

/** Glossy Aqua gel chrome for non-book product tiles, tinted from tag color. */
export function productAquaTileStyle(tintHex?: string): CSSProperties {
  const { r, g, b } = resolveAquaTintRgb(tintHex);
  const { r: midR, g: midG, b: midB } = aquaTileMidGradientRgb(tintHex);

  return {
    background: `linear-gradient(180deg,
      rgba(${r}, ${g}, ${b}, 0.72) 0%,
      rgba(${midR}, ${midG}, ${midB}, 0.48) 42%,
      rgba(255, 255, 255, 0.82) 100%)`,
    boxShadow: [
      "0 6px 14px -4px rgba(0,0,0,0.42)",
      "0 2px 4px rgba(0,0,0,0.2)",
      `0 1px 1px rgba(${r}, ${g}, ${b}, 0.45)`,
      "inset 0 1px 2px rgba(0,0,0,0.32)",
      "inset 0 2px 3px 1px rgba(255,255,255,0.58)",
    ].join(", "),
  };
}

/**
 * Clear glass chrome for shelf tiles that show a product photo.
 * Skips the strong tinted gel fill so packshots sit on a light well
 * without multiply (which darkens colored gel and leaves gray postcard boxes).
 *
 * The photo well is opaque, so it would hide any `inset` chrome painted here —
 * the rim and mat live in `productAquaPhotoMatStyle`, drawn above the photo.
 */
export function productAquaPhotoTileStyle(tintHex?: string): CSSProperties {
  const { r, g, b } = resolveAquaTintRgb(tintHex);

  return {
    background: `linear-gradient(180deg,
      rgba(${r}, ${g}, ${b}, 0.18) 0%,
      rgba(255, 255, 255, 0.94) 38%,
      rgba(255, 255, 255, 0.99) 100%)`,
    boxShadow: [
      "0 7px 16px -5px rgba(0,0,0,0.42)",
      "0 2px 4px rgba(0,0,0,0.18)",
      `0 1px 2px rgba(${r}, ${g}, ${b}, 0.3)`,
    ].join(", "),
  };
}

/** Cool paper mat the packshot is mounted on, nudged toward the tag tint. */
const PHOTO_MAT_BASE = { r: 231, g: 236, b: 243 };
const PHOTO_MAT_TINT_MIX = 0.16;

function photoMatRgb(tintHex?: string): { r: number; g: number; b: number } {
  const tint = resolveAquaTintRgb(tintHex);
  return {
    r: Math.round(
      PHOTO_MAT_BASE.r + (tint.r - PHOTO_MAT_BASE.r) * PHOTO_MAT_TINT_MIX
    ),
    g: Math.round(
      PHOTO_MAT_BASE.g + (tint.g - PHOTO_MAT_BASE.g) * PHOTO_MAT_TINT_MIX
    ),
    b: Math.round(
      PHOTO_MAT_BASE.b + (tint.b - PHOTO_MAT_BASE.b) * PHOTO_MAT_TINT_MIX
    ),
  };
}

/**
 * Mat + glass rim painted *over* the packshot.
 *
 * Blend modes can't dissolve a packshot's white background against a white
 * well (multiply against white is a no-op, and against tinted gel it darkens
 * the whole tile). Instead the same soft vignette washes the photo and the
 * well identically, so the photo's edges fade into the mat and the hard
 * postcard rectangle disappears while the center stays bright and untinted.
 */
export function productAquaPhotoMatStyle(tintHex?: string): CSSProperties {
  const { r, g, b } = resolveAquaTintRgb(tintHex);
  const mat = photoMatRgb(tintHex);

  return {
    background: `radial-gradient(125% 115% at 50% 38%,
      rgba(255, 255, 255, 0) 44%,
      rgba(${mat.r}, ${mat.g}, ${mat.b}, 0.4) 76%,
      rgba(${mat.r}, ${mat.g}, ${mat.b}, 0.84) 100%)`,
    boxShadow: [
      `inset 0 0 13px -5px rgba(${r}, ${g}, ${b}, 0.6)`,
      "inset 0 1px 2px rgba(0,0,0,0.18)",
      "inset 0 0 0 1px rgba(255,255,255,0.6)",
    ].join(", "),
  };
}

export function productAquaTileTextColor(tintHex?: string): string {
  const surfaceLuminance = aquaTilePlaceholderSurfaceLuminance(tintHex);
  return surfaceLuminance < AQUA_SURFACE_LIGHT_TEXT_LUMINANCE
    ? LIGHT_AQUA_TEXT
    : DARK_AQUA_TEXT;
}
