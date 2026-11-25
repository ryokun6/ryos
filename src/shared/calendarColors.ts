export const PRESET_CALENDAR_COLORS = [
  "blue",
  "red",
  "green",
  "orange",
  "purple",
] as const;

export type PresetEventColor = (typeof PRESET_CALENDAR_COLORS)[number];
export type HexEventColor = `#${string}`;
export type EventColor = PresetEventColor | HexEventColor;

export const PRESET_EVENT_COLOR_HEX: Record<PresetEventColor, HexEventColor> = {
  blue: "#4a90d9",
  red: "#d94a4a",
  green: "#5ab55a",
  orange: "#e89b3e",
  purple: "#9b59b6",
};

export interface GoogleEventPaletteEntry {
  id: string;
  name: string;
  hex: HexEventColor;
}

/**
 * Official Google Calendar per-event `colorId` palette ("1" through "11").
 * In Google Calendar, `event.colorId` is ONLY set when an event has an explicit
 * per-event color override; otherwise the event inherits its calendar's color.
 */
export const GOOGLE_EVENT_COLOR_PALETTE: readonly GoogleEventPaletteEntry[] = [
  { id: "11", name: "Tomato", hex: "#d50000" },
  { id: "4", name: "Flamingo", hex: "#e67c73" },
  { id: "6", name: "Tangerine", hex: "#f4511e" },
  { id: "5", name: "Banana", hex: "#f6bf26" },
  { id: "2", name: "Sage", hex: "#33b679" },
  { id: "10", name: "Basil", hex: "#0b8043" },
  { id: "7", name: "Peacock", hex: "#039be5" },
  { id: "9", name: "Blueberry", hex: "#3f51b5" },
  { id: "1", name: "Lavender", hex: "#7986cb" },
  { id: "3", name: "Grape", hex: "#8e24aa" },
  { id: "8", name: "Graphite", hex: "#616161" },
] as const;

export const GOOGLE_EVENT_COLOR_ID_TO_HEX: Record<string, HexEventColor> =
  Object.fromEntries(
    GOOGLE_EVENT_COLOR_PALETTE.map((entry) => [entry.id, entry.hex])
  ) as Record<string, HexEventColor>;

/**
 * Fallback Google Calendar `calendarList` `colorId` ("1"–"24") hex table,
 * used when a calendarList entry omits `backgroundColor` and only provides `colorId`.
 */
export const GOOGLE_CALENDAR_COLOR_ID_TO_HEX: Record<string, HexEventColor> = {
  "1": "#ac725e",
  "2": "#d06b64",
  "3": "#f83a22",
  "4": "#fa573c",
  "5": "#ff7537",
  "6": "#ffad46",
  "7": "#42d692",
  "8": "#16a765",
  "9": "#7bd148",
  "10": "#b3dc6c",
  "11": "#fbe983",
  "12": "#fad165",
  "13": "#92e1c0",
  "14": "#9fe1e7",
  "15": "#9fc6e7",
  "16": "#4986e7",
  "17": "#9a9cff",
  "18": "#b99aff",
  "19": "#c2c2c2",
  "20": "#cabdbf",
  "21": "#cca6ac",
  "22": "#f691b2",
  "23": "#cd74e6",
  "24": "#a47ae2",
};

const PRESET_TO_GOOGLE_EVENT_COLOR_ID: Record<PresetEventColor, string> = {
  blue: "9",
  red: "11",
  green: "10",
  orange: "6",
  purple: "3",
};

const HEX_6_RE = /^#([0-9a-fA-F]{6})$/;
const HEX_3_RE = /^#([0-9a-fA-F]{3})$/;

export function isPresetEventColor(value: unknown): value is PresetEventColor {
  return (
    typeof value === "string" &&
    (PRESET_CALENDAR_COLORS as readonly string[]).includes(value)
  );
}

export function normalizeHexColor(
  value: string | null | undefined
): HexEventColor | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const m6 = HEX_6_RE.exec(trimmed);
  if (m6) {
    return `#${m6[1]!.toLowerCase()}`;
  }
  const m3 = HEX_3_RE.exec(trimmed);
  if (m3) {
    const [r, g, b] = m3[1]!.toLowerCase().split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

export function isValidEventColor(value: unknown): value is EventColor {
  if (isPresetEventColor(value)) return true;
  return typeof value === "string" && normalizeHexColor(value) !== null;
}

export function normalizeEventColor(
  value: unknown,
  fallback: EventColor = "blue"
): EventColor {
  if (isPresetEventColor(value)) return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (isPresetEventColor(lower)) return lower;
    const hex = normalizeHexColor(lower);
    if (hex) return hex;
  }
  return fallback;
}

export function resolveEventColorToHex(
  color: EventColor | string | null | undefined,
  fallback: HexEventColor = PRESET_EVENT_COLOR_HEX.blue
): HexEventColor {
  if (!color) return fallback;
  if (isPresetEventColor(color)) {
    return PRESET_EVENT_COLOR_HEX[color];
  }
  const lower = color.trim().toLowerCase();
  if (isPresetEventColor(lower)) {
    return PRESET_EVENT_COLOR_HEX[lower];
  }
  return normalizeHexColor(lower) ?? fallback;
}

export function areEventColorsEquivalent(
  a: EventColor | string | null | undefined,
  b: EventColor | string | null | undefined
): boolean {
  if (!a || !b) return a === b;
  return resolveEventColorToHex(a) === resolveEventColorToHex(b);
}

export function mapGoogleEventColorIdToColor(
  colorId: string | null | undefined
): HexEventColor | null {
  if (!colorId) return null;
  const trimmed = colorId.trim();
  return GOOGLE_EVENT_COLOR_ID_TO_HEX[trimmed] ?? null;
}

export function mapGoogleCalendarListColor(params: {
  backgroundColor?: string | null;
  colorId?: string | null;
}): HexEventColor {
  const bg = normalizeHexColor(params.backgroundColor);
  if (bg) return bg;
  if (params.colorId) {
    const fromCalTable = GOOGLE_CALENDAR_COLOR_ID_TO_HEX[params.colorId.trim()];
    if (fromCalTable) return fromCalTable;
    const fromEvtTable = GOOGLE_EVENT_COLOR_ID_TO_HEX[params.colorId.trim()];
    if (fromEvtTable) return fromEvtTable;
  }
  return "#039be5";
}

function parseHexToRgb(hex: HexEventColor): [number, number, number] {
  const clean = hex.slice(1);
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): HexEventColor {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const h = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  ];
}

export function mapColorToClosestGoogleEventColorId(
  color: EventColor | string
): string {
  if (isPresetEventColor(color)) {
    return PRESET_TO_GOOGLE_EVENT_COLOR_ID[color];
  }
  const lower = color.trim().toLowerCase();
  if (isPresetEventColor(lower)) {
    return PRESET_TO_GOOGLE_EVENT_COLOR_ID[lower];
  }
  const hex = resolveEventColorToHex(lower);
  for (const entry of GOOGLE_EVENT_COLOR_PALETTE) {
    if (entry.hex === hex) return entry.id;
  }

  const [r1, g1, b1] = parseHexToRgb(hex);
  let bestId = "9";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const entry of GOOGLE_EVENT_COLOR_PALETTE) {
    const [r2, g2, b2] = parseHexToRgb(entry.hex);
    // Weighted Euclidean distance in sRGB (redmean approximation)
    const rMean = (r1 + r2) / 2;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    const dist =
      (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rMean) / 256) * db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestId = entry.id;
    }
  }
  return bestId;
}

export interface CalendarColorVisuals {
  /** Always a 6-digit `#rrggbb` string (safe for AquaCheckbox gradient `${color}dd`). */
  swatch: HexEventColor;
  /** Left stripe / selection border `#rrggbb` color. */
  accent: HexEventColor;
  /** Translucent pill background wash (`rgba(...)`). */
  wash: string;
  /** Contrast-tuned foreground label color for light or dark surfaces. */
  text: HexEventColor;
}

export function resolveCalendarColorVisuals(
  color: EventColor | string | null | undefined,
  options?: { isDarkMode?: boolean }
): CalendarColorVisuals {
  const isDarkMode = Boolean(options?.isDarkMode);
  const baseHex = resolveEventColorToHex(color);
  const [r, g, b] = parseHexToRgb(baseHex);
  const lum = relativeLuminance(r, g, b);
  const [h, s, l] = rgbToHsl(r, g, b);

  if (isDarkMode) {
    // On dark surfaces (#1e1e22 / dark glass), lift very dark colors for text & borders
    // while preserving the hue and saturation of Google's palette.
    const accentHex =
      lum < 0.08
        ? rgbToHex(...hslToRgb(h, s, Math.max(l, 0.45)))
        : baseHex;
    const textHex =
      lum < 0.32
        ? rgbToHex(...hslToRgb(h, Math.min(1, s * 1.05), Math.max(l, 0.68)))
        : baseHex;
    const washAlpha = lum < 0.12 ? 0.3 : 0.24;
    return {
      swatch: baseHex,
      accent: accentHex,
      wash: `rgba(${r}, ${g}, ${b}, ${washAlpha})`,
      text: textHex,
    };
  }

  // On light surfaces (#ffffff / light glass), darken overly bright pastels/yellows
  // (e.g. Google Banana #f6bf26 or Ice #9fe1e7) so text stays crisp and readable,
  // while leaving balanced colors (including all 5 classic ryOS presets) untouched.
  const textHex =
    lum > 0.42
      ? rgbToHex(...hslToRgb(h, Math.min(1, Math.max(s, 0.45)), Math.min(l, 0.36)))
      : baseHex;
  const washAlpha = lum > 0.5 ? 0.22 : 0.15;

  return {
    swatch: baseHex,
    accent: baseHex,
    wash: `rgba(${r}, ${g}, ${b}, ${washAlpha})`,
    text: textHex,
  };
}
