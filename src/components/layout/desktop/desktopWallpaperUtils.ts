import { INDEXEDDB_PREFIX } from "@/stores/useDisplaySettingsStore";
import { isDynamicWallpaper } from "@/utils/dynamicWallpaper";
import type { DesktopStyles } from "./desktopTypes";

export function getWallpaperStyles(
  path: string,
  isVideoWallpaper: boolean
): DesktopStyles {
  if (!path || isVideoWallpaper) return {};

  if (path.startsWith(INDEXEDDB_PREFIX)) return {};

  // Dynamic wallpapers (gradient / cover) paint via a dedicated React layer
  // rather than a CSS background-image. Unresolved shuffle descriptors also
  // land here briefly before the runtime source resolves to a concrete asset.
  if (isDynamicWallpaper(path)) return {};

  // Static photos / tiles are painted by the `DesktopStaticWallpaper` layer so
  // wallpaper swaps can preload and crossfade instead of clearing to blank and
  // popping the new image in once it downloads. Nothing to paint on the desktop
  // div itself.
  return {};
}
