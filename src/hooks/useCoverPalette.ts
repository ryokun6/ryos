import { useState, useEffect } from "react";

const DEFAULT_PALETTE = [
  "#274754",
  "#9c2b2b",
  "#e07c4c",
  "#f4a462",
  "#c9b896",
  "#e8dcd0",
  "#ffffff",
];

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}

/** Squared RGB distance for distinctness check (avoids sqrt) */
function colorDistSq(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

/** Min squared distance to be considered "distinct" (≈70 in linear space; lower for 7 colors) */
const MIN_DISTINCT_SQ = 70 * 70;

const COLOR_COUNT = 7;

/**
 * Extracts 7 distinct main colors from cover art.
 * Samples a grid, quantizes to reduce noise, counts frequency, then greedily
 * picks the 7 most frequent colors that are visually distinct from each other.
 */
function extractPaletteFromImage(img: HTMLImageElement): string[] {
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return DEFAULT_PALETTE;

  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  // Quantize to 16 levels per channel, build frequency map
  const step = 4; // sample every 4th pixel
  const quant = 16;
  const freq = new Map<number, { r: number; g: number; b: number; n: number }>();

  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const i = (y * size + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const a = data[i + 3] ?? 255;
      if (a < 128) continue; // skip transparent

      const qr = Math.floor(r / (256 / quant)) * (256 / quant);
      const qg = Math.floor(g / (256 / quant)) * (256 / quant);
      const qb = Math.floor(b / (256 / quant)) * (256 / quant);
      const key = (qr << 16) | (qg << 8) | qb;

      const v = freq.get(key);
      if (v) {
        v.r += r;
        v.g += g;
        v.b += b;
        v.n++;
      } else {
        freq.set(key, { r, g, b, n: 1 });
      }
    }
  }

  // Sort by frequency (most common first)
  const sorted = [...freq.entries()]
    .map(([_, v]) => ({
      r: v.r / v.n,
      g: v.g / v.n,
      b: v.b / v.n,
      n: v.n,
    }))
    .sort((a, b) => b.n - a.n);

  if (sorted.length === 0) return DEFAULT_PALETTE;

  // Greedily pick N distinct colors
  const result: string[] = [];
  for (const c of sorted) {
    if (result.length >= COLOR_COUNT) break;
    const tooClose = result.some((hex) => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
      if (!m) return false;
      const r2 = parseInt(m[1]!, 16);
      const g2 = parseInt(m[2]!, 16);
      const b2 = parseInt(m[3]!, 16);
      return colorDistSq(c.r, c.g, c.b, r2, g2, b2) < MIN_DISTINCT_SQ;
    });
    if (!tooClose) {
      result.push(rgbToHex(c.r, c.g, c.b));
    }
  }

  // If we couldn't get enough distinct, add most frequent not yet picked
  for (const c of sorted) {
    if (result.length >= COLOR_COUNT) break;
    const hex = rgbToHex(c.r, c.g, c.b);
    if (!result.includes(hex)) result.push(hex);
  }

  return result.length >= COLOR_COUNT ? result : DEFAULT_PALETTE;
}

/**
 * Extracts a 7-color palette from cover art for use in mesh gradients.
 * Returns default palette while loading or on CORS/load error.
 */
export function useCoverPalette(coverUrl: string | null): string[] {
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);

  useEffect(() => {
    if (!coverUrl) {
      setPalette(DEFAULT_PALETTE);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        setPalette(extractPaletteFromImage(img));
      } catch {
        setPalette(DEFAULT_PALETTE);
      }
    };

    img.onerror = () => {
      setPalette(DEFAULT_PALETTE);
    };

    img.src = coverUrl;
  }, [coverUrl]);

  return palette;
}
