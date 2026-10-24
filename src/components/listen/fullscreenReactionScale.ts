import type { ReactionFloaterPhysics } from "./reactionFloaterConstants";

/**
 * Mirrors `.fullscreen-lyrics-text` in `src/index.css` (and the macOS theme
 * reassertion in `src/styles/themes/aqua.css`):
 * `font-size: clamp(32px, min(10vw, 10vh), 120px)`.
 * Fullscreen listen-together reactions divide by the 32px floor so a lyric
 * size of 32px keeps today's glyph size, and larger viewports grow together.
 */
export const FULLSCREEN_LYRICS_FONT_MIN_PX = 32;
export const FULLSCREEN_LYRICS_FONT_MAX_PX = 120;
/** 10vw / 10vh */
export const FULLSCREEN_LYRICS_VIEWPORT_RATIO = 0.1;

/** Windowed glyph size before the per-burst `scale` and the CSS transform. */
export const SESSION_REACTION_BASE_ICON_PX = 22;

/** Spawn tuck under the bottom edge at viewport scale 1 (see ReactionFloaterLayer). */
export const SESSION_REACTION_ENTER_OFFSET_PX = 16;
export const SESSION_REACTION_ENTER_KEYFRAME_PX = 14;

const EDGE_PADDING_PX = 16;

export function fullscreenLyricsFontSizePx(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return FULLSCREEN_LYRICS_FONT_MIN_PX;
  const preferred =
    FULLSCREEN_LYRICS_VIEWPORT_RATIO * Math.min(width, height);
  return Math.min(
    FULLSCREEN_LYRICS_FONT_MAX_PX,
    Math.max(FULLSCREEN_LYRICS_FONT_MIN_PX, preferred),
  );
}

/** 1 at the 32px lyric floor, up to 120/32 on a TV-sized viewport. */
export function fullscreenLyricsScale(width: number, height: number): number {
  return fullscreenLyricsFontSizePx(width, height) / FULLSCREEN_LYRICS_FONT_MIN_PX;
}

export function fullscreenLyricsScaleFromFontSizePx(fontSizePx: number): number {
  if (!Number.isFinite(fontSizePx) || fontSizePx <= 0) return 1;
  return fontSizePx / FULLSCREEN_LYRICS_FONT_MIN_PX;
}

export interface ScaledSessionReactionMotion {
  iconSize: number;
  xOffset: number;
  floatHeight: number;
  wobble: number;
  enterOffset: number;
  enterKeyframe: number;
}

/**
 * Scale a listen-together floater. `viewportScale` 1 is the windowed size
 * (no edge clamp). Above 1, distances grow with the lyrics and the glyph is
 * kept inside the viewport, including the sideways wobble and the top of the
 * float. The per-burst motion `scale` keyframes stay put — they already
 * multiply this icon size.
 */
export function scaleSessionReactionMotion(
  physics: Pick<ReactionFloaterPhysics, "xOffset" | "scale" | "floatHeight" | "wobble">,
  viewportScale: number,
  viewport?: { width: number; height: number },
): ScaledSessionReactionMotion {
  const scale = viewportScale > 0 && Number.isFinite(viewportScale) ? viewportScale : 1;
  const iconSize = Math.round(SESSION_REACTION_BASE_ICON_PX * physics.scale * scale);
  let xOffset = physics.xOffset * scale;
  let floatHeight = physics.floatHeight * scale;
  let wobble = physics.wobble * scale;

  if (scale > 1 && viewport && viewport.width > 0 && viewport.height > 0) {
    const peakVisual = iconSize * physics.scale;
    const halfIcon = peakVisual / 2;
    const xLimit = Math.max(0, viewport.width / 2 - halfIcon - EDGE_PADDING_PX);
    const span = Math.abs(xOffset) + Math.abs(wobble);
    if (span > xLimit && span > 0) {
      const fit = xLimit / span;
      xOffset *= fit;
      wobble *= fit;
    }

    // Last keyframe is the highest point; its transform scale is 0.66× the burst.
    const topHalf = (iconSize * physics.scale * 0.66) / 2;
    const floatLimit = Math.max(0, viewport.height - topHalf - EDGE_PADDING_PX);
    floatHeight = Math.min(floatHeight, floatLimit);
  }

  return {
    iconSize,
    xOffset,
    floatHeight,
    wobble,
    enterOffset: SESSION_REACTION_ENTER_OFFSET_PX * scale,
    enterKeyframe: SESSION_REACTION_ENTER_KEYFRAME_PX * scale,
  };
}
