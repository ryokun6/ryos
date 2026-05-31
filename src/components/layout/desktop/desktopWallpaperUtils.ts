import { INDEXEDDB_PREFIX } from "@/stores/useDisplaySettingsStore";
import type { DesktopStyles } from "./desktopTypes";

export function getWallpaperStyles(
  path: string,
  isVideoWallpaper: boolean
): DesktopStyles {
  if (!path || isVideoWallpaper) return {};

  if (path.startsWith(INDEXEDDB_PREFIX)) return {};

  const isTiled = path.includes("/wallpapers/tiles/");
  return {
    backgroundImage: `url(${path})`,
    backgroundSize: isTiled ? "64px 64px" : "cover",
    backgroundRepeat: isTiled ? "repeat" : "no-repeat",
    backgroundPosition: "center",
    transition: "background-image 0.3s ease-in-out",
  };
}
