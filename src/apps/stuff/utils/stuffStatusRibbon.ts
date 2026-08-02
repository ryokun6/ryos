import type { StuffStatus } from "../types";

export interface StuffStatusRibbonStyle {
  background: string;
  color: string;
}

/** Nameplate / status colors (readable on wood shelf and light/dark covers). */
const STATUS_RIBBON_STYLES: Record<StuffStatus, StuffStatusRibbonStyle> = {
  in_use: { background: "#15803d", color: "#f0fdf4" },
  stowed: { background: "#475569", color: "#f8fafc" },
  for_sale: { background: "#c2410c", color: "#fff7ed" },
  reserved: { background: "#7e22ce", color: "#faf5ff" },
  sold: { background: "#1d4ed8", color: "#eff6ff" },
  discarded: { background: "#57534e", color: "#fafaf9" },
};

export function stuffStatusRibbonStyle(
  status: StuffStatus
): StuffStatusRibbonStyle {
  return STATUS_RIBBON_STYLES[status];
}

/** Parse `#rgb` / `#rrggbb` into 0–255 channels. */
function parseHexRgb(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Opaque mix of two hex colors. `weight` is how much of `from` remains
 * (0 = all `toward`, 1 = all `from`). Never uses alpha — Permanent Marker
 * self-overlapping strokes make translucent fills look nearly full-bright.
 */
export function mixOpaqueHex(
  from: string,
  toward: string,
  weight: number
): string {
  const a = parseHexRgb(from);
  const b = parseHexRgb(toward);
  if (!a || !b) return from;
  const t = Math.min(1, Math.max(0, weight));
  const r = Math.round(a[0] * t + b[0] * (1 - t));
  const g = Math.round(a[1] * t + b[1] * (1 - t));
  const bl = Math.round(a[2] * t + b[2] * (1 - t));
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Dimmed nameplate text for struck-through original prices.
 *
 * Must be an **opaque** rgb (not alpha / color-mix with transparent):
 * ryOS `body` sets `-webkit-font-smoothing: none`, and Permanent Marker's
 * self-overlapping strokes make translucent fills look nearly full-bright.
 *
 * Mix the label color toward the **plate background** (not black). A dark
 * gray toward black sits at nearly the same luminance as the sold blue plate
 * (`#1d4ed8`), so struck originals disappeared and sold nameplates looked
 * like status-only ("Sold"). A lighter wash stays secondary to the sale
 * amount / label while remaining readable on the plate.
 */
export function stuffStatusStruckColor(status: StuffStatus): string {
  const { background, color } = STATUS_RIBBON_STYLES[status];
  // ~62% label / 38% plate — quieter than full label, still clear on blue.
  return mixOpaqueHex(color, background, 0.62);
}
