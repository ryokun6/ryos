import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useNowPlayingCover } from "@/hooks/useNowPlayingCover";
import { useWeatherWallpaper } from "@/hooks/useWeatherWallpaper";
import { useNowPlayingLyrics } from "@/hooks/useNowPlayingLyrics";
import { MeshGradientBackground } from "@/components/shared/MeshGradientBackground";
import { LyricsDisplay } from "@/apps/ipod/components/lyrics-display/LyricsDisplay";
import {
  getDayNightGradientCss,
  getWeatherGradientCss,
  isCoverWallpaper,
  isDayNightGradientWallpaper,
  isLyricsWallpaper,
  isWeatherWallpaper,
} from "@/utils/dynamicWallpaper";

/** Recompute the day/night gradient roughly once a minute. */
const GRADIENT_REFRESH_MS = 60 * 1000;

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

function WeatherGradientLayer() {
  const { weatherCode } = useWeatherWallpaper();
  const [gradient, setGradient] = useState(() =>
    getWeatherGradientCss(weatherCode)
  );

  // Recompute on the minute timer (time-of-day) and whenever the live weather
  // code changes. The gradient reads the wall clock internally.
  useEffect(() => {
    const update = () => setGradient(getWeatherGradientCss(weatherCode));
    update();
    const id = setInterval(update, GRADIENT_REFRESH_MS);
    return () => clearInterval(id);
  }, [weatherCode]);

  return (
    <div
      className="absolute inset-0 w-full h-full z-[-10]"
      style={{
        backgroundImage: gradient,
        transition: "background-image 3s linear",
      }}
    />
  );
}

function LyricsWallpaperLayer() {
  const np = useNowPlayingLyrics();

  return (
    <div className="absolute inset-0 w-full h-full z-[-10] overflow-hidden bg-neutral-950">
      {/* "Gradient paper" — the same animated Paper mesh-gradient shader the
          iPod / Karaoke use, tinted by the now-playing cover art. */}
      <MeshGradientBackground
        coverUrl={np.coverUrl}
        isActive
        className="absolute inset-0 w-full h-full"
      />
      {/* Soft darkening keeps the lyrics and desktop icons readable. */}
      <div className="absolute inset-0 w-full h-full bg-black/30" />
      {np.hasLyrics && (
        <LyricsDisplay
          lines={np.lyricsControls.lines}
          originalLines={np.lyricsControls.originalLines}
          currentLine={np.lyricsControls.currentLine}
          isLoading={np.lyricsControls.isLoading}
          error={np.lyricsControls.error}
          visible
          videoVisible
          fontClassName={np.lyricsFontClassName}
          isTranslating={np.lyricsControls.isTranslating}
          furiganaMap={np.furiganaMap}
          soramimiMap={np.soramimiMap}
          currentTimeMs={np.currentTimeMs}
          showInterludeEllipsis
        />
      )}
    </div>
  );
}

function CoverWallpaperLayer() {
  const { coverUrl } = useNowPlayingCover();

  return (
    <div className="absolute inset-0 w-full h-full z-[-10] overflow-hidden bg-neutral-950">
      <AnimatePresence mode="popLayout">
        {coverUrl ? (
          <motion.div
            key={coverUrl}
            className="absolute inset-0 w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Full-bleed cover: fills the entire desktop, cropping as needed. */}
            <div
              className="absolute inset-0 w-full h-full"
              style={{
                backgroundImage: `url("${coverUrl}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            />
            {/* Subtle darkening keeps desktop icons readable. */}
            <div className="absolute inset-0 w-full h-full bg-black/25" />
          </motion.div>
        ) : (
          <motion.div
            key="cover-empty"
            className="absolute inset-0 w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{
              backgroundImage:
                "linear-gradient(to bottom, #1a1a1f 0%, #0c0c10 100%)",
            }}
          />
        )}
      </AnimatePresence>
    </div>
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
    return <WeatherGradientLayer />;
  }
  if (isCoverWallpaper(currentWallpaper)) {
    return <CoverWallpaperLayer />;
  }
  if (isLyricsWallpaper(currentWallpaper)) {
    return <LyricsWallpaperLayer />;
  }
  return null;
}
