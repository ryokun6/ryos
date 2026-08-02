/** Slight tilt so nameplates look hand-placed (degrees). */
export const NAMEPLATE_ROTATE_DEG_MIN = -6;
export const NAMEPLATE_ROTATE_DEG_MAX = 6;

/**
 * Pixel offsets from the default bottom-right anchor.
 * Biased left/up so plates stay on the cover face (positive Y = down;
 * keep max small so random pose never clears the cover bottom).
 */
export const NAMEPLATE_OFFSET_X_MIN = -8;
export const NAMEPLATE_OFFSET_X_MAX = 4;
export const NAMEPLATE_OFFSET_Y_MIN = -10;
export const NAMEPLATE_OFFSET_Y_MAX = 1;

export interface StuffNameplatePose {
  rotateDeg: number;
  offsetX: number;
  offsetY: number;
}

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/**
 * Deterministic nameplate pose from an item id (stable across re-renders).
 */
export function nameplatePoseFromId(id: string): StuffNameplatePose {
  const h = hashId(id || "stuff-nameplate");
  // Three weakly independent unit floats from the same 32-bit hash.
  const tRotate = (h & 0xffff) / 0xffff;
  const tX = ((h >>> 8) & 0xffff) / 0xffff;
  const tY = ((h >>> 16) & 0xffff) / 0xffff;

  return {
    rotateDeg: lerp(NAMEPLATE_ROTATE_DEG_MIN, NAMEPLATE_ROTATE_DEG_MAX, tRotate),
    offsetX: lerp(NAMEPLATE_OFFSET_X_MIN, NAMEPLATE_OFFSET_X_MAX, tX),
    offsetY: lerp(NAMEPLATE_OFFSET_Y_MIN, NAMEPLATE_OFFSET_Y_MAX, tY),
  };
}
