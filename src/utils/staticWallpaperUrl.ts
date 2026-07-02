/**
 * Resolves the full-fidelity source for a static wallpaper.
 *
 * `background-size: cover` depends on both viewport axes and each image's
 * intrinsic aspect ratio, so a width-only variant selector cannot guarantee
 * enough pixels (especially in portrait). Canonical paths also avoid
 * recompressing sources smaller than a nominal variant. Keep these stable,
 * already-immutable URLs as the render source; placeholders still provide the
 * progressive first paint while the image decodes.
 */
export function resolveStaticWallpaperRenderUrl(
  canonicalSource: string
): string {
  return canonicalSource;
}
