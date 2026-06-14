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

  const isTiled = path.includes("/wallpapers/tiles/");
  return {
    backgroundImage: `url(${path})`,
    backgroundSize: isTiled ? "64px 64px" : "cover",
    backgroundRepeat: isTiled ? "repeat" : "no-repeat",
    backgroundPosition: "center",
    transition: "background-image 0.3s ease-in-out",
  };
}
