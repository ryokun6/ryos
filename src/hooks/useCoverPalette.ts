import { useReducer, useEffect } from "react";

export const DEFAULT_COVER_PALETTE = [
  "#274754",
  "#9c2b2b",
  "#e07c4c",
  "#f4a462",
  "#c9b896",
  "#e8dcd0",
  "#ffffff",
];

export type CoverPaletteSource = "default" | "cover";

export interface CoverPaletteResult {
  palette: string[];
  source: CoverPaletteSource;
  coverUrl: string | null;
}

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
const HEX_COLOR_RE = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = HEX_COLOR_RE.exec(hex);
  if (!m) return null;
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

function mixHexColors(fromHex: string, toHex: string, amount: number): string | null {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  if (!from || !to) return null;

  return rgbToHex(
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount
  );
}

export function completeCoverPalette(colors: string[]): string[] {
  if (colors.length === 0) return DEFAULT_COVER_PALETTE;

  const result = [...colors];
  const selectedHexes = new Set(result.map((hex) => hex.toLowerCase()));
  const addColor = (hex: string | null) => {
    if (!hex || result.length >= COLOR_COUNT) return;
    const key = hex.toLowerCase();
    if (selectedHexes.has(key)) return;
    result.push(hex);
    selectedHexes.add(key);
  };

  for (let i = 0; i < colors.length && result.length < COLOR_COUNT; i++) {
    const current = colors[i]!;
    const next = colors[(i + 1) % colors.length] ?? current;
    if (current === next) continue;
    for (const amount of [0.25, 0.5, 0.75]) {
      addColor(mixHexColors(current, next, amount));
    }
  }

  for (const color of colors) {
    for (const amount of [0.16, 0.32, 0.48, 0.64, 0.8, 1]) {
      addColor(mixHexColors(color, "#ffffff", amount));
    }
    addColor(mixHexColors(color, "#000000", 0.2));
    addColor(mixHexColors(color, "#000000", 0.4));
  }

  for (const color of DEFAULT_COVER_PALETTE) {
    addColor(color);
  }

  return result.slice(0, COLOR_COUNT);
}

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
  if (!ctx) return DEFAULT_COVER_PALETTE;

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

  if (sorted.length === 0) return DEFAULT_COVER_PALETTE;

  // Greedily pick N distinct colors
  const result: string[] = [];
  const selectedHexes = new Set<string>();
  for (const c of sorted) {
    if (result.length >= COLOR_COUNT) break;
    const tooClose = result.some((hex) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return false;
      const [r2, g2, b2] = rgb;
      return colorDistSq(c.r, c.g, c.b, r2, g2, b2) < MIN_DISTINCT_SQ;
    });
    if (!tooClose) {
      const hex = rgbToHex(c.r, c.g, c.b);
      result.push(hex);
      selectedHexes.add(hex);
    }
  }

  // If we couldn't get enough distinct, add most frequent not yet picked
  for (const c of sorted) {
    if (result.length >= COLOR_COUNT) break;
    const hex = rgbToHex(c.r, c.g, c.b);
    if (!selectedHexes.has(hex)) {
      result.push(hex);
      selectedHexes.add(hex);
    }
  }

  return completeCoverPalette(result);
}

/**
 * Extracts a 7-color palette from cover art for use in mesh gradients.
 * Returns default palette while loading or on CORS/load error.
 */
export function useCoverPaletteResult(coverUrl: string | null): CoverPaletteResult {
  interface CoverPaletteState {
    palette: string[];
    source: CoverPaletteSource;
    coverUrl: string | null;
  }

  const initialState: CoverPaletteState = {
    palette: DEFAULT_COVER_PALETTE,
    source: "default",
    coverUrl: null,
  };

  type CoverPaletteAction = {
    type: "setPalette";
    palette: string[];
    source: CoverPaletteSource;
    coverUrl: string | null;
  };

  const reducer = (
    state: CoverPaletteState,
    action: CoverPaletteAction
  ): CoverPaletteState => {
    switch (action.type) {
      case "setPalette":
        return {
          ...state,
          palette: action.palette,
          source: action.source,
          coverUrl: action.coverUrl,
        };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    if (!coverUrl) {
      dispatch({
        type: "setPalette",
        palette: DEFAULT_COVER_PALETTE,
        source: "default",
        coverUrl: null,
      });
      return;
    }

    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        if (isCancelled) return;
        dispatch({
          type: "setPalette",
          palette: extractPaletteFromImage(img),
          source: "cover",
          coverUrl,
        });
      } catch {
        if (isCancelled) return;
        dispatch({
          type: "setPalette",
          palette: DEFAULT_COVER_PALETTE,
          source: "default",
          coverUrl,
        });
      }
    };

    img.onerror = () => {
      if (isCancelled) return;
      dispatch({
        type: "setPalette",
        palette: DEFAULT_COVER_PALETTE,
        source: "default",
        coverUrl,
      });
    };

    img.src = coverUrl;
    return () => {
      isCancelled = true;
    };
  }, [coverUrl]);

  return state;
}

export function useCoverPalette(coverUrl: string | null): string[] {
  return useCoverPaletteResult(coverUrl).palette;
}
