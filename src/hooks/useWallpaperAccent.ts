import { useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useCoverPaletteResult } from "@/hooks/useCoverPalette";
import { useNowPlayingCover } from "@/hooks/useNowPlayingCover";
import { DEFAULT_ACCENT, getAccentChrome } from "@/themes/accents";
import {
  normalizeWallpaperAccentColor,
  resolveWallpaperAccentFromPalette,
} from "@/themes/wallpaperAccentColor";
import {
  getDayNightGradientColors,
  isCoverWallpaper,
  isDayNightGradientWallpaper,
} from "@/utils/dynamicWallpaper";

// The gradient drifts with wall-clock time, so re-derive its accent on a slow
// interval to keep it tracking the day → night shift.
const GRADIENT_ACCENT_REFRESH_MS = 60 * 1000;

const rgbToHex = ([r, g, b]: [number, number, number]): string =>
  `#${[r, g, b]
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;

/**
 * Drives the `"wallpaper"` accent: when the active theme uses it, derive a
 * representative color from the current wallpaper and feed it to the theme
 * store, which repaints the accent CSS vars.
 *
 * Image wallpapers (including shuffle photos) and the now-playing cover sample
 * a color via the same canvas palette-extraction the iPod cover-art glow uses.
 * The day/night gradient — which has no loadable image — derives its accent
 * directly from the live gradient colors. Video wallpapers and load/CORS
 * failures fall back to the theme's classic look.
 */
export function useWallpaperAccent() {
  const current = useThemeStore((s) => s.current);
  const accent = useThemeStore(
    (s) => s.accentByTheme[s.current] ?? DEFAULT_ACCENT
  );
  const setWallpaperAccentColor = useThemeStore(
    (s) => s.setWallpaperAccentColor
  );
  const { currentWallpaper, wallpaperSource, isVideoWallpaper } =
    useWallpaper();

  const isWallpaperAccent =
    getAccentChrome(current) !== null && accent === "wallpaper";

  const isGradient = isDayNightGradientWallpaper(currentWallpaper);
  const isCover = isCoverWallpaper(currentWallpaper);

  const { coverUrl: nowPlayingCoverUrl } = useNowPlayingCover();

  // Pick the image URL fed to the canvas palette extractor:
  //  - cover wallpaper → the now-playing album art
  //  - image wallpapers (incl. shuffle photos) → the resolved wallpaper source
  //  - gradient / video / inactive → none (handled separately or skipped)
  let sampleUrl: string | null = null;
  if (isWallpaperAccent && !isGradient) {
    if (isCover) {
      sampleUrl = nowPlayingCoverUrl;
    } else if (!isVideoWallpaper) {
      sampleUrl = wallpaperSource || null;
    }
  }

  const { palette, source, coverUrl } = useCoverPaletteResult(sampleUrl);

  useEffect(() => {
    if (!isWallpaperAccent || isGradient) return;
    // Only act on a palette actually extracted from an image.
    if (source !== "cover" || !coverUrl) return;
    setWallpaperAccentColor(resolveWallpaperAccentFromPalette(palette));
  }, [
    isWallpaperAccent,
    isGradient,
    source,
    coverUrl,
    palette,
    setWallpaperAccentColor,
  ]);

  // Day/night gradient: derive the accent from the live gradient's mid color
  // and refresh on an interval so it tracks the day → night transition.
  useEffect(() => {
    if (!isWallpaperAccent || !isGradient) return;

    const apply = () => {
      const [, mid] = getDayNightGradientColors(new Date());
      setWallpaperAccentColor(normalizeWallpaperAccentColor(rgbToHex(mid)));
    };

    apply();
    const id = window.setInterval(apply, GRADIENT_ACCENT_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [isWallpaperAccent, isGradient, setWallpaperAccentColor]);
}
