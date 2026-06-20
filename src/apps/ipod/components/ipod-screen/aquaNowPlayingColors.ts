/**
 * Aqua Glass "Now Playing" screen colors.
 *
 * In the Aqua Glass skin the now-playing screen paints its whole background
 * with the cover-art-derived accent color (see `useCoverGlowColor`). Because
 * that background can be any hue/brightness, the screen text + titlebar
 * text/icons must flip between dark and light for legibility. These helpers
 * pick the readable tone from the background's perceived luminance.
 */

export type AquaNowPlayingTone = "dark" | "light";

export interface AquaNowPlayingColors {
  tone: AquaNowPlayingTone;
  /** Softened cover color used as the screen background (less intense). */
  background: string;
  /** Solid foreground for primary text (title) + titlebar icons. */
  primary: string;
  /** Muted foreground for secondary text (artist, album, times, counts). */
  secondary: string;
}

/**
 * How far to mix the vivid cover accent toward white for the screen bg.
 * The raw `useCoverGlowColor` accent is boosted to be punchy for the menu
 * chrome; as a full-screen background that's too saturated, so we tone it
 * down here.
 */
const BG_WHITEN = 0.58;

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let value = match[1];
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const int = parseInt(value, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b]
    .map((n) => clamp(n).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Mix an rgb color toward white by `t` (0 = unchanged, 1 = white). */
function mixWhite(
  [r, g, b]: [number, number, number],
  t: number
): [number, number, number] {
  return [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t];
}

/** Perceived (Rec. 601) luminance in 0..1. */
function perceivedLuminance([r, g, b]: [number, number, number]): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Above this background luminance, dark text reads better than light. */
const LUMINANCE_THRESHOLD = 0.6;

export function aquaNowPlayingColorsForBg(hex: string): AquaNowPlayingColors {
  const rgb = parseHex(hex);
  // Unknown colors fall back to a soft neutral Aqua blue → light text.
  const bgRgb = rgb ? mixWhite(rgb, BG_WHITEN) : ([58, 160, 255] as const);
  const background = toHex(bgRgb as [number, number, number]);
  const luminance = perceivedLuminance(bgRgb as [number, number, number]);
  const tone: AquaNowPlayingTone =
    luminance > LUMINANCE_THRESHOLD ? "dark" : "light";
  return tone === "dark"
    ? { tone, background, primary: "#000000", secondary: "rgba(0, 0, 0, 0.55)" }
    : {
        tone,
        background,
        primary: "#ffffff",
        secondary: "rgba(255, 255, 255, 0.72)",
      };
}
