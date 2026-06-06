import type { OsMacChrome, OsThemeId } from "./types";

/**
 * Accent color support for the two classic Mac chromes (Aqua + System 7).
 *
 * The accent drives the active selection color/gradient used across menus,
 * dropdowns, buttons, sidebar selected items, switches, focus rings, etc. It is
 * implemented entirely through CSS custom properties set inline on `<html>`, so
 * any surface that reads `--os-color-selection-*` (or the derived accent vars
 * below) follows the user's choice automatically.
 *
 * `"default"` is a sentinel that means "use the theme's classic look" — when it
 * is active we set NO inline overrides so the stylesheet defaults (Aqua blue /
 * System 7 black, including their dark-mode + brushed-metal variants) stay the
 * single source of truth.
 */
export type AccentId =
  | "default"
  | "wallpaper"
  | "graphite"
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal";

/**
 * Accents whose base color is a fixed swatch. `"default"` (no override) and
 * `"wallpaper"` (color sampled live from the active wallpaper) are special and
 * therefore excluded.
 */
type StaticAccentId = Exclude<AccentId, "default" | "wallpaper">;

/**
 * Implicit accent for themes that have never had one chosen. We default to
 * `"wallpaper"` so a fresh install picks up a color sampled from the desktop;
 * the `"default"` option (labelled "System" in the UI) remains an explicit
 * choice that restores the theme's classic selection color.
 */
export const DEFAULT_ACCENT: AccentId = "wallpaper";

export type AccentChrome = OsMacChrome; // "aqua" | "system7"

interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Base solid color for each named accent (the swatch shown in the picker). */
const ACCENT_BASE: Record<StaticAccentId, string> = {
  // Cool blue-leaning gray — still clearly gray, but with a subtle blue tint
  // (blue channel sits above red/green) so it reads as macOS "graphite".
  graphite: "#888d99",
  blue: "#2765ca",
  purple: "#8344c4",
  pink: "#e0539b",
  red: "#d23b30",
  orange: "#e07b1a",
  yellow: "#e8b500",
  green: "#3a9a45",
  teal: "#159aa8",
};

/** Classic per-chrome default swatch (what `"default"` looks like). */
const DEFAULT_SWATCH: Record<AccentChrome, string> = {
  aqua: "#2765ca",
  system7: "#000000",
};

/**
 * Placeholder swatch for the "wallpaper" accent before a color has been sampled
 * (or when the wallpaper isn't a samplable image). A rainbow conic gradient
 * hints that the color is derived automatically.
 */
const WALLPAPER_SWATCH_PLACEHOLDER =
  "conic-gradient(from 0deg, #e0539b, #e07b1a, #e8b500, #3a9a45, #159aa8, #2765ca, #8344c4, #e0539b)";

/** Ordered accent options shown in the picker, per chrome. */
const AQUA_ORDER: AccentId[] = [
  "default",
  "wallpaper",
  "graphite",
  "purple",
  "pink",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
];

const SYSTEM7_ORDER: AccentId[] = [
  "default",
  "wallpaper",
  "graphite",
  "blue",
  "purple",
  "pink",
  "red",
  "orange",
  "green",
  "teal",
];

export interface AccentOption {
  id: AccentId;
  /** Solid color for the picker swatch. */
  swatch: string;
}

export function getAccentOptions(
  chrome: AccentChrome,
  /** Live sampled wallpaper color, used as the "wallpaper" option's swatch. */
  wallpaperColor?: string | null
): AccentOption[] {
  const order = chrome === "aqua" ? AQUA_ORDER : SYSTEM7_ORDER;
  return order.map((id) => ({
    id,
    swatch:
      id === "default"
        ? DEFAULT_SWATCH[chrome]
        : id === "wallpaper"
          ? wallpaperColor || WALLPAPER_SWATCH_PLACEHOLDER
          : ACCENT_BASE[id],
  }));
}

export function isValidAccent(
  chrome: AccentChrome,
  id: string | null | undefined
): id is AccentId {
  if (!id) return false;
  const order = chrome === "aqua" ? AQUA_ORDER : SYSTEM7_ORDER;
  return (order as string[]).includes(id);
}

/** Resolve the chrome (Aqua / System 7) that supports an accent for a theme. */
export function getAccentChrome(theme: OsThemeId): AccentChrome | null {
  if (theme === "macosx") return "aqua";
  if (theme === "system7") return "system7";
  return null;
}

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

/** Validate + normalize a `#rrggbb` / `#rgb` hex string (else `null`). */
export function normalizeAccentHex(
  hex: string | null | undefined
): string | null {
  const trimmed = hex?.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^#[0-9a-f]{6}$/.test(trimmed) || /^#[0-9a-f]{3}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function parseHex(hex: string): RGB {
  const clean = hex.replace("#", "");
  const value =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Mix `color` toward `target` by `amount` (0..1). */
function mix(color: RGB, target: RGB, amount: number): RGB {
  return {
    r: clamp(color.r + (target.r - color.r) * amount),
    g: clamp(color.g + (target.g - color.g) * amount),
    b: clamp(color.b + (target.b - color.b) * amount),
  };
}

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };

const lighten = (c: RGB, amount: number) => mix(c, WHITE, amount);
const darken = (c: RGB, amount: number) => mix(c, BLACK, amount);

function rgba({ r, g, b }: RGB, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function rgb({ r, g, b }: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Perceived luminance (0..1) used to pick a readable text color. */
function luminance({ r, g, b }: RGB): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Readable foreground for a given selection background. */
function readableText(base: RGB): string {
  return luminance(base) > 0.62 ? "#1f1a00" : "#ffffff";
}

/** HSL hue (0..360) + saturation (0..1) for a color. */
function hueSat({ r, g, b }: RGB): { hue: number; sat: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const sat =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, sat };
}

/**
 * Hue of the stock Aqua assets (apple.png, active-tab gloss) that we recolor by
 * rotating toward the chosen accent's hue. The default blue accent matches it,
 * so `"default"` needs no filter.
 */
const AQUA_BLUE_HUE = 217;

/** CSS `filter` that recolors the blue Apple logo toward the accent hue. */
function appleFilter(base: RGB): string {
  const { hue, sat } = hueSat(base);
  // Low-saturation accents (graphite) read best as a neutral, desaturated logo.
  if (sat < 0.12) return "grayscale(1) brightness(1.03)";
  let delta = hue - AQUA_BLUE_HUE;
  // Normalize to the shortest rotation for a more faithful recolor.
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return `hue-rotate(${Math.round(delta)}deg) saturate(1.05)`;
}

// ---------------------------------------------------------------------------
// CSS variable generation
// ---------------------------------------------------------------------------

/**
 * Compute the inline CSS custom properties to apply on `<html>` for the chosen
 * accent. Returns an empty object for `"default"` (no overrides — keep the
 * stylesheet's classic look intact).
 */
export function getAccentCssVars(
  chrome: AccentChrome,
  accent: AccentId,
  isDark: boolean,
  /**
   * Live color sampled from the wallpaper, required for the `"wallpaper"`
   * accent. When it's missing (not yet sampled / unsamplable wallpaper) we emit
   * no overrides so the theme keeps its classic look until a color arrives.
   */
  wallpaperBase?: string | null
): Record<string, string> {
  if (accent === "default") return {};

  let base: RGB;
  if (accent === "wallpaper") {
    const normalized = normalizeAccentHex(wallpaperBase);
    if (!normalized) return {};
    base = parseHex(normalized);
  } else {
    base = parseHex(ACCENT_BASE[accent]);
  }
  const text = readableText(base);

  if (chrome === "system7") {
    // System 7 selections are flat fills — no gradients.
    return {
      "--os-color-selection-bg": rgb(base),
      "--os-color-selection-text": text,
      "--os-color-input-focus-border": rgb(base),
      "--os-color-switch-track-checked": rgb(base),
    };
  }

  // Aqua: translucent solid selection + a glossy gradient for list/brushed-metal
  // surfaces, focus rings, and the pulsing primary button.
  const selectionAlpha = isDark ? 0.85 : 0.88;

  // Brushed-metal/Finder list gloss. Dark mode keeps the accent hue but pulls
  // every stop deep into the darker half of the family so it sits quietly on
  // the dark window (mirrors the hardcoded dark blue it replaces).
  const gradientTop = isDark ? darken(base, 0.18) : lighten(base, 0.4);
  const gradientMid = isDark ? darken(base, 0.34) : lighten(base, 0.15);
  const gradientBottom = isDark ? darken(base, 0.52) : base;

  // Aqua primary button / switch-knob gloss.
  const buttonTop = isDark ? darken(base, 0.62) : darken(base, 0.28);
  const buttonMid = isDark ? darken(base, 0.42) : base;
  const buttonBottom = isDark ? darken(base, 0.28) : lighten(base, 0.22);
  const buttonEdge = isDark ? darken(base, 0.66) : darken(base, 0.2);
  const buttonAlpha = isDark ? 0.72 : 0.78;
  const buttonMidAlpha = isDark ? 0.72 : 0.72;

  // Active Aqua tab gloss (dark → mid → bright, top to bottom). The bottom stop
  // keeps some of the accent hue instead of washing out to white; dark mode
  // dims every stop deep so it sits on the dark window.
  const tabActive = isDark
    ? `linear-gradient(${rgb(darken(base, 0.56))}, ${rgb(
        darken(base, 0.36)
      )}, ${rgb(darken(base, 0.22))})`
    : `linear-gradient(${rgb(base)}, ${rgb(lighten(base, 0.42))}, ${rgb(
        lighten(base, 0.72)
      )})`;
  // The glossy strip beneath the tab bar. Dark mode mirrors the multi-stop
  // depth of the classic blue seam (dark top edge → soft sheen → varied mids)
  // but stays deep in the darker half so it doesn't read as a bright flat bar
  // against the dark window.
  const tabBarLine = isDark
    ? `linear-gradient(to bottom, ${rgb(darken(base, 0.72))} 0%, ${rgb(
        darken(base, 0.32)
      )} 8%, ${rgb(darken(base, 0.44))} 25%, ${rgb(
        darken(base, 0.58)
      )} 40%, ${rgb(darken(base, 0.46))} 60%, ${rgb(
        darken(base, 0.38)
      )} 80%, ${rgb(darken(base, 0.52))} 100%)`
    : `linear-gradient(to bottom, ${rgb(darken(base, 0.1))} 0%, ${rgb(
        lighten(base, 0.85)
      )} 8%, ${rgb(lighten(base, 0.35))} 40%, ${rgb(lighten(base, 0.5))} 100%)`;

  // Tab edge shadows + label shadow tinted to the accent (replace blue defaults).
  const tabShadowDeep = darken(base, 0.7);
  const tabTextShadow = darken(base, 0.25);
  // Dark mode: keep the bottom border deep in the darker family so it blends
  // with the tab's bottom stop instead of drawing a bright stroke under the tab.
  const tabBorder = isDark ? darken(base, 0.22) : lighten(base, 0.72);

  // Glossy 4-stop highlight for selected/pressed brushed-metal toolbar segments.
  const insetGradient = isDark
    ? `linear-gradient(to bottom, ${rgb(darken(base, 0.3))} 0%, ${rgb(
        darken(base, 0.14)
      )} 49%, ${rgb(darken(base, 0.34))} 50%, ${rgb(darken(base, 0.1))} 100%)`
    : `linear-gradient(to bottom, ${rgb(lighten(base, 0.3))} 0%, ${rgb(
        lighten(base, 0.5)
      )} 49%, ${rgb(lighten(base, 0.28))} 50%, ${rgb(
        lighten(base, 0.62)
      )} 100%)`;

  return {
    "--os-color-selection-bg": rgba(base, selectionAlpha),
    "--os-color-selection-text": text,
    "--os-color-selection-text-shadow": "none",
    "--os-color-selection-glow": rgba(base, isDark ? 0.55 : 0.5),
    "--os-color-input-focus-border": rgba(base, 0.6),
    "--os-color-input-focus-ring": rgba(base, 0.25),
    "--os-color-switch-track-checked": rgb(base),
    // Glossy vertical gradient used by brushed-metal lists, Finder list rows,
    // and TV drawer rows (consumed via `var(--os-accent-list-gradient, …)`).
    "--os-accent-list-gradient": `linear-gradient(180deg, ${rgb(
      gradientTop
    )} 0%, ${rgb(gradientMid)} 50%, ${rgb(gradientBottom)} 100%)`,
    // Glossy 4-stop highlight for selected/pressed brushed-metal toolbar
    // segments (`.metal-inset-btn`), with the mid-point "lip" break that gives
    // the Aqua sheen (consumed via `var(--os-accent-inset-gradient, …)`).
    "--os-accent-inset-gradient": insetGradient,
    // Aqua primary button gloss (consumed via `var(--os-accent-button-*, …)`).
    "--os-accent-button-bg": `linear-gradient(${rgba(
      buttonTop,
      buttonAlpha
    )}, ${rgba(buttonMid, buttonMidAlpha)}, ${rgba(buttonBottom, buttonAlpha)})`,
    "--os-accent-button-edge": rgba(buttonEdge, 0.5),
    "--os-accent-button-inner": rgba(buttonEdge, 0.75),
    // Aqua tabs (consumed via `var(--os-accent-tab-*, …)`).
    "--os-accent-tab-active-bg": tabActive,
    "--os-accent-tab-bar-line": tabBarLine,
    "--os-accent-tab-shadow-deep": rgba(tabShadowDeep, 0.8),
    "--os-accent-tab-shadow-edge-strong": rgba(base, 0.75),
    "--os-accent-tab-shadow-edge-soft": rgba(base, 0.5),
    "--os-accent-tab-text-shadow": rgba(tabTextShadow, 0.5),
    "--os-accent-tab-border": rgb(tabBorder),
    // Apple-logo hue (consumed via `var(--os-accent-apple-filter, none)`).
    "--os-accent-apple-filter": appleFilter(base),
  };
}

/** CSS custom properties that this module may set, so callers can clear them. */
export const ACCENT_CSS_VAR_NAMES = [
  "--os-color-selection-bg",
  "--os-color-selection-text",
  "--os-color-selection-text-shadow",
  "--os-color-selection-glow",
  "--os-color-input-focus-border",
  "--os-color-input-focus-ring",
  "--os-color-switch-track-checked",
  "--os-accent-list-gradient",
  "--os-accent-inset-gradient",
  "--os-accent-button-bg",
  "--os-accent-button-edge",
  "--os-accent-button-inner",
  "--os-accent-tab-active-bg",
  "--os-accent-tab-bar-line",
  "--os-accent-tab-shadow-deep",
  "--os-accent-tab-shadow-edge-strong",
  "--os-accent-tab-shadow-edge-soft",
  "--os-accent-tab-text-shadow",
  "--os-accent-tab-border",
  "--os-accent-apple-filter",
] as const;
