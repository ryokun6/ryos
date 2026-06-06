import { useWallpaperAccent } from "./useWallpaperAccent";

/** Mounts {@link useWallpaperAccent} once at the app root so the wallpaper
 * accent stays in sync with the active wallpaper regardless of open apps. */
export function WallpaperAccentRunner() {
  useWallpaperAccent();
  return null;
}
