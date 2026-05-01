/** localStorage key for compact (mobile) TV playlist drawer pixel height */
export const TV_COMPACT_DRAWER_HEIGHT_LS_KEY = "ryos_tv_compact_drawer_height_px_v2";

/** Default compact drawer height (slightly taller than the old ~200px cap). */
export function defaultTvCompactDrawerHeightPx(innerHeight: number): number {
  return Math.round(Math.min(innerHeight * 0.34, 236));
}

/**
 * Clamps drawer height so the playlist stays usable and does not eat the entire viewport.
 * `viewportInnerHeight` should be visualViewport.height when available else window.innerHeight.
 */
export function getTvCompactDrawerHeightBounds(viewportInnerHeight: number): {
  minPx: number;
  maxPx: number;
} {
  const minPx = 120;
  const maxPx = Math.max(
    minPx,
    Math.round(
      Math.min(viewportInnerHeight * 0.58, viewportInnerHeight - 160)
    )
  );
  return { minPx, maxPx };
}

export function clampTvCompactDrawerHeightPx(
  px: number,
  viewportInnerHeight: number
): number {
  const { minPx, maxPx } = getTvCompactDrawerHeightBounds(viewportInnerHeight);
  return Math.min(maxPx, Math.max(minPx, Math.round(px)));
}
