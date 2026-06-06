import { useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useCoverPaletteResult } from "@/hooks/useCoverPalette";
import { pickPrimaryColor } from "@/apps/ipod/components/lyrics-display/colorUtils";
import { DEFAULT_ACCENT, getAccentChrome } from "@/themes/accents";

/**
 * Drives the `"wallpaper"` accent: when the active theme uses it, sample a
 * representative color from the current wallpaper image (reusing the same
 * palette-extraction the iPod cover-art glow uses) and feed it to the theme
 * store, which repaints the accent CSS vars.
 *
 * Only runs the (canvas-backed) extraction while the wallpaper accent is
 * actually selected and the wallpaper is a samplable image — video wallpapers
 * and load/CORS failures fall back to the theme's classic look.
 */
export function useWallpaperAccent() {
  const current = useThemeStore((s) => s.current);
  const accent = useThemeStore(
    (s) => s.accentByTheme[s.current] ?? DEFAULT_ACCENT
  );
  const setWallpaperAccentColor = useThemeStore(
    (s) => s.setWallpaperAccentColor
  );
  const { wallpaperSource, isVideoWallpaper } = useWallpaper();

  const isWallpaperAccent =
    getAccentChrome(current) !== null && accent === "wallpaper";

  // Feed a URL to the extractor only when the wallpaper accent is active and the
  // wallpaper is an image; otherwise pass null so no canvas work happens.
  const sampleUrl =
    isWallpaperAccent && !isVideoWallpaper ? wallpaperSource || null : null;

  const { palette, source, coverUrl } = useCoverPaletteResult(sampleUrl);

  useEffect(() => {
    if (!isWallpaperAccent) return;
    // Only act on a palette actually extracted from the wallpaper image.
    if (source !== "cover" || !coverUrl) return;
    setWallpaperAccentColor(pickPrimaryColor(palette));
  }, [isWallpaperAccent, source, coverUrl, palette, setWallpaperAccentColor]);
}
