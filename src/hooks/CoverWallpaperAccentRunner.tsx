import { useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useCoverPaletteResult } from "@/hooks/useCoverPalette";
import { useNowPlayingCover } from "@/hooks/useNowPlayingCover";
import { resolveWallpaperAccentFromPalette } from "@/themes/wallpaperAccentColor";

/**
 * Cover / lyrics wallpaper accent: tint from the now-playing album art via the
 * same canvas palette-extraction the iPod cover-art glow uses.
 *
 * Lives in its own module (lazily mounted by {@link WallpaperAccentRunner})
 * because {@link useNowPlayingCover} subscribes to the full iPod + Karaoke
 * store stack, which should not load at boot for users on other wallpapers.
 */
export function CoverWallpaperAccentRunner() {
  const setWallpaperAccentColor = useThemeStore(
    (s) => s.setWallpaperAccentColor
  );
  const { coverUrl: nowPlayingCoverUrl } = useNowPlayingCover();
  const { palette, source, coverUrl } = useCoverPaletteResult(
    nowPlayingCoverUrl
  );

  useEffect(() => {
    // Only act on a palette actually extracted from an image.
    if (source !== "cover" || !coverUrl) return;
    setWallpaperAccentColor(resolveWallpaperAccentFromPalette(palette));
  }, [source, coverUrl, palette, setWallpaperAccentColor]);

  return null;
}
