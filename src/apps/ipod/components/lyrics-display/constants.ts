import type { FuriganaSegment } from "@/utils/romanization";

export const ANIMATION_CONFIG = {
  spring: {
    type: "spring" as const,
    stiffness: 200,
    damping: 30,
    mass: 1,
  },
  fade: {
    duration: 0.2,
  },
} as const;

export const BASE_SHADOW = "0 0 6px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.5)";
// Text shadow glow for non-word-timed lines
export const GLOW_SHADOW = "0 0 6px rgba(255,255,255,1), 0 0 6px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.5)";
// Drop shadow filter for word-timed glow (applied to container, not clipped by mask)
export const GLOW_FILTER = "drop-shadow(0 0 6px rgba(255,255,255,0.4))";
export const FEATHER = 15; // Width of the soft edge in percentage
export const OLD_SCHOOL_FEATHER = 3; // Sharper edge for old-school karaoke

// Old-school karaoke styling (for rounded font)
// Uses -webkit-text-stroke for clean outlines that scale with text
export const OLD_SCHOOL_OUTLINE_WIDTH = "0.12em";
export const OLD_SCHOOL_BASE_STROKE = `${OLD_SCHOOL_OUTLINE_WIDTH} rgba(0,0,0,0.7)`;
export const OLD_SCHOOL_HIGHLIGHT_STROKE = `${OLD_SCHOOL_OUTLINE_WIDTH} #fff`;
// Old-school karaoke colors
export const OLD_SCHOOL_BASE_COLOR = "#fff";
export const OLD_SCHOOL_HIGHLIGHT_COLOR = "#0066FF";
// Padding for old-school karaoke (scales with text)
export const OLD_SCHOOL_PADDING = "0.2em";
// Extra top padding to accommodate furigana + stroke
export const OLD_SCHOOL_PADDING_TOP = "0.4em";
// Bottom padding for old-school (less than default since no glow)
export const OLD_SCHOOL_PADDING_BOTTOM = "0.2em";
export const LYRICS_SHADOW_BLEED_X = "var(--lyrics-shadow-bleed-x, max(10px, 0.18em))";
export const LYRICS_SHADOW_BLEED_TOP = "var(--lyrics-shadow-bleed-top, 0.24em)";
export const LYRICS_SHADOW_BLEED_BOTTOM = "var(--lyrics-shadow-bleed-bottom, 0.4em)";

// === NEW STYLE CONSTANTS ===

// Serif Red (Japanese classic) - same outline style but with red highlight
export const SERIF_RED_HIGHLIGHT_COLOR = "#CC0000";

// Glow fallback color (used when no album art is available)
export const GOLD_GLOW_COLOR_FALLBACK = "#FFD700";

// Gradient (Rainbow) - cyan starting color, hue-rotate animates both text and glow together
export const GRADIENT_COLORS = "#00FFFF"; // Cyan starting color (hue-rotate will cycle it)
export const GRADIENT_GLOW_SHADOW = "0 0 6px rgba(0,255,255,0.5), 0 0 12px rgba(0,255,255,0.3), 0 0 4px rgba(0,0,0,0.3)";
export const GRADIENT_GLOW_FILTER = "drop-shadow(0 0 6px rgba(0,255,255,0.5)) drop-shadow(0 0 12px rgba(0,255,255,0.3))";

// Shared empty maps used as the default for furigana/soramimi props. Allocating
// `new Map()` in the destructured defaults would create a fresh identity on
// every render and bust downstream `useCallback`/`useMemo` deps that include
// these maps (e.g. `renderWithFurigana`).
export const EMPTY_FURIGANA_MAP: ReadonlyMap<string, FuriganaSegment[]> = new Map();
export const EMPTY_SORAMIMI_MAP: ReadonlyMap<string, FuriganaSegment[]> = new Map();

// Style category detection
export type StyleCategory = 'outline-blue' | 'outline-red' | 'glow-white' | 'glow-gold' | 'glow-gradient';

export const getStyleCategory = (className: string): StyleCategory => {
  if (className.includes("font-lyrics-rounded") && !className.includes("gold-glow")) {
    return 'outline-blue';
  }
  if (className.includes("font-lyrics-serif-red")) {
    return 'outline-red';
  }
  if (className.includes("font-lyrics-gold-glow")) {
    return 'glow-gold';
  }
  if (className.includes("font-lyrics-gradient")) {
    return 'glow-gradient';
  }
  return 'glow-white'; // Default for serif, sans-serif
};

/**
 * CSS-based mask using custom property for GPU-accelerated animation.
 * The gradient is computed in CSS using calc(), avoiding string allocation on every frame.
 * --mask-progress is a value from 0 to 1 set via JS.
 */
export const CSS_MASK_GRADIENT = `linear-gradient(to right, black calc(var(--mask-progress, 0) * ${100 + FEATHER}% - ${FEATHER}%), transparent calc(var(--mask-progress, 0) * ${100 + FEATHER}%))`;
// Sharper mask for old-school karaoke
export const CSS_MASK_GRADIENT_OLD_SCHOOL = `linear-gradient(to right, black calc(var(--mask-progress, 0) * ${100 + OLD_SCHOOL_FEATHER}% - ${OLD_SCHOOL_FEATHER}%), transparent calc(var(--mask-progress, 0) * ${100 + OLD_SCHOOL_FEATHER}%))`;

