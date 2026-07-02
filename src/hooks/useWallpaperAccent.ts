import { useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useCoverPaletteResult } from "@/hooks/useCoverPalette";
import { useWeatherWallpaper } from "@/hooks/useWeatherWallpaper";
import { useWeatherSimulationStore } from "@/stores/useWeatherSimulationStore";
import { DEFAULT_ACCENT, getAccentChrome } from "@/themes/accents";
import {
  normalizeWallpaperAccentColor,
  resolveWallpaperAccentFromPalette,
} from "@/themes/wallpaperAccentColor";
import {
  getDayNightGradientColors,
  getWeatherGradientColors,
  isConcreteWallpaperSource,
  isCoverWallpaper,
  isDayNightGradientWallpaper,
  isLyricsWallpaper,
  isWeatherWallpaper,
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
 * Image wallpapers (including shuffle photos) and the now-playing cover/lyrics
 * wallpapers sample a color via the same canvas palette-extraction the iPod
 * cover-art glow uses. The day/night and weather gradients — which have no
 * loadable image — derive their accent directly from the live gradient's main
 * (mid) color. Video wallpapers and load/CORS failures fall back to the theme's
 * classic look.
 *
 * Returns `weatherAccentActive` / `coverAccentActive` so the runner can mount
 * the matching sub-runner (live weather + geolocation, or the now-playing
 * iPod/Karaoke cover stack) only while that wallpaper is actually driving the
 * accent.
 */
export function useWallpaperAccent(): {
  weatherAccentActive: boolean;
  coverAccentActive: boolean;
} {
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
  const isWeather = isWeatherWallpaper(currentWallpaper);
  const isCover = isCoverWallpaper(currentWallpaper);
  const isLyrics = isLyricsWallpaper(currentWallpaper);
  // Cover + lyrics wallpapers both tint from the now-playing album art, exactly
  // like the Karaoke/lyrics cover-color path. That sampling lives in the
  // lazily-mounted CoverWallpaperAccentRunner (it subscribes to the iPod +
  // Karaoke stores); this hook only handles plain image wallpapers.
  const isCoverBased = isCover || isLyrics;

  // Pick the image URL fed to the canvas palette extractor:
  //  - image wallpapers (incl. shuffle photos) → the resolved wallpaper source
  //  - cover / lyrics / gradient / weather / video / inactive → none (handled
  //    by the sub-runners or skipped)
  let sampleUrl: string | null = null;
  if (
    isWallpaperAccent &&
    !isGradient &&
    !isWeather &&
    !isCoverBased &&
    !isVideoWallpaper &&
    isConcreteWallpaperSource(wallpaperSource)
  ) {
    sampleUrl = wallpaperSource;
  }

  const { palette, source, coverUrl } = useCoverPaletteResult(sampleUrl);

  useEffect(() => {
    if (!isWallpaperAccent || isGradient || isWeather || isCoverBased) return;
    // Only act on a palette actually extracted from an image.
    if (source !== "cover" || !coverUrl) return;
    setWallpaperAccentColor(resolveWallpaperAccentFromPalette(palette));
  }, [
    isWallpaperAccent,
    isGradient,
    isWeather,
    isCoverBased,
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

  return {
    weatherAccentActive: isWallpaperAccent && isWeather,
    coverAccentActive: isWallpaperAccent && isCoverBased,
  };
}

/**
 * Weather wallpaper accent: derive the accent from the live weather gradient's
 * mid color, refreshed on the minute timer and whenever the live weather code
 * changes (so it tracks both the day → night drift and condition changes).
 *
 * Split into its own hook so the runner only subscribes to {@link
 * useWeatherWallpaper} — which triggers geolocation / a weather fetch — while
 * the weather wallpaper is actually driving the accent.
 */
export function useWeatherWallpaperAccent() {
  const setWallpaperAccentColor = useThemeStore(
    (s) => s.setWallpaperAccentColor
  );
  const { weatherCode } = useWeatherWallpaper();
  const simulatedWeatherCode = useWeatherSimulationStore(
    (s) => s.simulatedWeatherCode
  );
  const effectiveCode = simulatedWeatherCode ?? weatherCode;

  useEffect(() => {
    const apply = () => {
      const [, mid] = getWeatherGradientColors(effectiveCode, new Date());
      setWallpaperAccentColor(normalizeWallpaperAccentColor(rgbToHex(mid)));
    };

    apply();
    const id = window.setInterval(apply, GRADIENT_ACCENT_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [effectiveCode, setWallpaperAccentColor]);
}
