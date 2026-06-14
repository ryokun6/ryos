import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useNowPlayingCover } from "@/hooks/useNowPlayingCover";
import { useWeatherWallpaper } from "@/hooks/useWeatherWallpaper";
import { useNowPlayingLyrics } from "@/hooks/useNowPlayingLyrics";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useIpodPipActive } from "@/apps/ipod/hooks/useIpodPipActive";
import { useSaveSongCoverColor } from "@/hooks/useSaveSongCoverColor";
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

// Mirror the Karaoke fullscreen lyric sizing so the wallpaper renders large,
// viewport-relative lyrics (rather than the small in-app default).
const LYRICS_WALLPAPER_GAP = "clamp(0.2rem, calc(min(10vw, 10vh) * 0.08), 1rem)";

// Bottom clearance (px) so the lyrics sit above the dock / taskbar. Matches the
// PiP + toast bottom offsets used elsewhere so the lyrics line up with the rest
// of the desktop chrome. Aqua glass sits a little higher than classic Aqua.
const LYRICS_DOCK_CLEARANCE_GLASS = 82;
const LYRICS_DOCK_CLEARANCE_AQUA = 72;
const LYRICS_DOCK_CLEARANCE_WINDOWS = 42;
const LYRICS_DOCK_CLEARANCE_DEFAULT = 16;
// Lift the lyrics further off the dock so the bottom line has room to breathe
// rather than hugging the dock/taskbar.
const LYRICS_EXTRA_LIFT = 96;
// Extra clearance (px) when the iPod "pop player" (PiP) is showing: the floating
// player is ~64px tall and sits just above the dock, so lift the lyrics past it.
const LYRICS_PIP_CLEARANCE = 76;

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
  const { isMacOSTheme, isAquaGlass, isWinXp, isWin98 } = useThemeFlags();
  const pipActive = useIpodPipActive();
  // Persist the resolved cover color back to the song (and store) so the lyric
  // highlight color matches the song palette — exactly like the Karaoke overlay.
  const saveCoverColor = useSaveSongCoverColor(np.track);

  // Reserve enough bottom space for the lyrics to clear the dock / taskbar, plus
  // the iPod pop player (PiP) when it's active. The offset differs for Aqua vs
  // Aqua Glass since the glass dock sits a touch higher.
  const containerStyle = useMemo<CSSProperties>(() => {
    const isWindowsTheme = isWinXp || isWin98;
    const dockClearance = isMacOSTheme
      ? isAquaGlass
        ? LYRICS_DOCK_CLEARANCE_GLASS
        : LYRICS_DOCK_CLEARANCE_AQUA
      : isWindowsTheme
        ? LYRICS_DOCK_CLEARANCE_WINDOWS
        : LYRICS_DOCK_CLEARANCE_DEFAULT;
    const paddingBottomPx =
      dockClearance +
      LYRICS_EXTRA_LIFT +
      (pipActive ? LYRICS_PIP_CLEARANCE : 0);
    return {
      gap: LYRICS_WALLPAPER_GAP,
      paddingLeft: "env(safe-area-inset-left, 0px)",
      paddingRight: "env(safe-area-inset-right, 0px)",
      paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${paddingBottomPx}px)`,
    };
  }, [isMacOSTheme, isAquaGlass, isWinXp, isWin98, pipActive]);

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
          textSizeClass="fullscreen-lyrics-text"
          gapClass="gap-0"
          containerStyle={containerStyle}
          coverUrl={np.coverUrl}
          coverColor={np.track?.coverColor}
          onCoverColorResolved={saveCoverColor}
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
