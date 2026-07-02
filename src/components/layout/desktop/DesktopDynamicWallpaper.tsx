import { Suspense, lazy, useEffect, useState } from "react";
import {
  getDayNightGradientCss,
  getWeatherGradientCss,
  isCoverWallpaper,
  isDayNightGradientWallpaper,
  isLyricsWallpaper,
  isWeatherWallpaper,
} from "@/utils/dynamicWallpaper";
import { useWallpaper } from "@/hooks/useWallpaper";

/** Recompute the day/night gradient roughly once a minute. */
const GRADIENT_REFRESH_MS = 60 * 1000;

// The weather / lyrics / cover layers are code-split because they pull heavy
// dependency graphs that must not load at boot for users on other wallpapers:
//   - weather → WeatherShaderBackground → three (~465KB chunk)
//   - lyrics  → YouTubePlayer (react-player) + KaraokeVisualLayers (three) +
//               LyricsDisplay (pinyin-pro / wanakana / hangul romanization) +
//               the full iPod/Karaoke store stack
//   - cover   → the iPod/Karaoke store stack
// While a lazy chunk loads, a lightweight CSS-only fallback renders so the
// desktop background never flashes.
const WeatherGradientLayer = lazy(() =>
  import("./DesktopWeatherWallpaperLayer").then((m) => ({
    default: m.WeatherGradientLayer,
  }))
);
const LyricsWallpaperLayer = lazy(() =>
  import("./DesktopLyricsWallpaperLayer").then((m) => ({
    default: m.LyricsWallpaperLayer,
  }))
);
const CoverWallpaperLayer = lazy(() =>
  import("./DesktopCoverWallpaperLayer").then((m) => ({
    default: m.CoverWallpaperLayer,
  }))
);

function DayNightGradientLayer() {
  const [gradient, setGradient] = useState(() => getDayNightGradientCss());

  useEffect(() => {
    const update = () => setGradient(getDayNightGradientCss());
    update();
    const id = setInterval(update, GRADIENT_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="absolute inset-0 w-full h-full z-[-10]"
      style={{
        backgroundImage: gradient,
        // Slow cross-fade between successive gradients so shifts feel ambient.
        transition: "background-image 3s linear",
      }}
    />
  );
}

/** CSS-only weather sky shown while the shader layer's chunk loads. */
function WeatherGradientFallback() {
  return (
    <div
      className="absolute inset-0 w-full h-full z-[-10]"
      style={{ backgroundImage: getWeatherGradientCss(null) }}
    />
  );
}

/** Dark backdrop shown while the lyrics / cover layer's chunk loads. */
function DarkWallpaperFallback() {
  return (
    <div className="absolute inset-0 w-full h-full z-[-10] bg-neutral-950" />
  );
}

/**
 * Renders dynamic desktop wallpapers (day/night gradient and now-playing cover)
 * that can't be expressed as a single CSS background-image. Returns null for all
 * other wallpaper kinds (static images, tiles, videos, shuffle — those render
 * via the desktop background styles / video element).
 */
export function DesktopDynamicWallpaper() {
  const { currentWallpaper } = useWallpaper();

  if (isDayNightGradientWallpaper(currentWallpaper)) {
    return <DayNightGradientLayer />;
  }
  if (isWeatherWallpaper(currentWallpaper)) {
    return (
      <Suspense fallback={<WeatherGradientFallback />}>
        <WeatherGradientLayer />
      </Suspense>
    );
  }
  if (isCoverWallpaper(currentWallpaper)) {
    return (
      <Suspense fallback={<DarkWallpaperFallback />}>
        <CoverWallpaperLayer />
      </Suspense>
    );
  }
  if (isLyricsWallpaper(currentWallpaper)) {
    return (
      <Suspense fallback={<DarkWallpaperFallback />}>
        <LyricsWallpaperLayer />
      </Suspense>
    );
  }
  return null;
}
