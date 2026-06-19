import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useNowPlayingCover } from "@/hooks/useNowPlayingCover";
import { useWeatherWallpaper } from "@/hooks/useWeatherWallpaper";
import { useNowPlayingLyrics } from "@/hooks/useNowPlayingLyrics";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useIpodPipActive } from "@/apps/ipod/hooks/useIpodPipActive";
import { useSaveSongCoverColor } from "@/hooks/useSaveSongCoverColor";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useWeatherSimulationStore } from "@/stores/useWeatherSimulationStore";
import { SF_LAT, SF_LON } from "@/stores/useWeatherStore";
import { WeatherShaderBackground } from "@/components/shared/WeatherShaderBackground";
import { YouTubePlayer } from "@/components/shared/YouTubePlayer";
import { KaraokeVisualLayers } from "@/apps/karaoke/components/karaoke-app/KaraokeVisualLayers";
import { DisplayMode } from "@/types/lyrics";
import { getWeatherEmoji } from "@/lib/weather/openMeteo";
import { Emoji } from "@/components/shared/Emoji";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LyricsDisplay } from "@/apps/ipod/components/lyrics-display/LyricsDisplay";
import {
  getDayNightGradientCss,
  getWeatherGradientColors,
  getWeatherGradientCss,
  isCoverWallpaper,
  isDayNightGradientWallpaper,
  isLyricsWallpaper,
  isWeatherWallpaper,
  weatherCodeToFamily,
  type WeatherFamily,
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
// Lift the lyrics slightly off the dock/taskbar without pushing the block too
// high on the desktop.
const LYRICS_EXTRA_LIFT = 48;
// Extra clearance (px) when the iPod "pop player" (PiP) is showing: the floating
// player is ~64px tall and sits just above the dock, so lift the lyrics past it.
const LYRICS_PIP_CLEARANCE = 76;

// Mirror listen-sync thresholds so the muted wallpaper player tracks the
// primary iPod / Karaoke player without constant hard seeks.
const WALLPAPER_SOFT_SYNC_THRESHOLD_SEC = 0.5;
const WALLPAPER_HARD_SEEK_THRESHOLD_SEC = 3;
const WALLPAPER_SEEK_JUMP_THRESHOLD_SEC = 0.75;

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

// Translation key suffix per weather family for the condition label.
const WEATHER_CONDITION_KEY: Record<WeatherFamily, string> = {
  clear: "clear",
  partlyCloudy: "partlyCloudy",
  fog: "fog",
  drizzle: "drizzle",
  rain: "rain",
  snow: "snow",
  thunderstorm: "thunderstorm",
};

// Debug-mode condition simulator: a representative WMO code per family so the
// shader renders each look. `weatherCodeToFamily` maps these back to families.
const SIMULATABLE_WEATHER: { family: WeatherFamily; code: number }[] = [
  { family: "clear", code: 0 },
  { family: "partlyCloudy", code: 2 },
  { family: "fog", code: 45 },
  { family: "drizzle", code: 51 },
  { family: "rain", code: 61 },
  { family: "snow", code: 71 },
  { family: "thunderstorm", code: 95 },
];

// Normalize the [top, mid, bottom] gradient colors (0..255) to shader-space
// vec3 components (0..1).
function toShaderColors(code: number | null): {
  top: [number, number, number];
  mid: [number, number, number];
  bottom: [number, number, number];
} {
  const [top, mid, bottom] = getWeatherGradientColors(code);
  const n = (rgb: [number, number, number]): [number, number, number] => [
    rgb[0] / 255,
    rgb[1] / 255,
    rgb[2] / 255,
  ];
  return { top: n(top), mid: n(mid), bottom: n(bottom) };
}

// Extra bottom clearance (px) so the weather text clears the dock / taskbar,
// mirroring PipPlayer's per-theme bottom offsets.
const WEATHER_BOTTOM_WINDOWS = 42;
const WEATHER_BOTTOM_DEFAULT = 16;
// Lift the text above the iPod pop player (PiP) when it's showing.
const WEATHER_PIP_CLEARANCE = 76;
// macOS top-left placement: gap below the menu bar and inset from the left edge.
const WEATHER_TOP_GAP = 20;
const WEATHER_LEFT_INSET = 28;
// Vertical offset so the debug condition picker clears the overlay text block.
const WEATHER_SELECT_OFFSET = 96;

function WeatherGradientLayer() {
  const { t } = useTranslation();
  const { weatherCode, isDay, temperature, city, lat, lon } =
    useWeatherWallpaper();
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();
  const isPhone = useIsPhone();
  const pipActive = useIpodPipActive();
  const debugMode = useDisplaySettingsStore((s) => s.debugMode);
  const simulatedWeatherCode = useWeatherSimulationStore(
    (s) => s.simulatedWeatherCode
  );
  const setSimulatedWeatherCode = useWeatherSimulationStore(
    (s) => s.setSimulatedWeatherCode
  );

  // Debug simulation (when set) overrides the live condition for all weather
  // visuals; temperature + city always stay live.
  const effectiveCode = simulatedWeatherCode ?? weatherCode;

  const [gradient, setGradient] = useState(() =>
    getWeatherGradientCss(effectiveCode)
  );
  const [colors, setColors] = useState(() => toShaderColors(effectiveCode));

  // Recompute on the minute timer (time-of-day) and whenever the effective
  // weather code changes. The gradient reads the wall clock internally.
  useEffect(() => {
    const update = () => {
      setGradient(getWeatherGradientCss(effectiveCode));
      setColors(toShaderColors(effectiveCode));
    };
    update();
    const id = setInterval(update, GRADIENT_REFRESH_MS);
    return () => clearInterval(id);
  }, [effectiveCode]);

  const family = weatherCodeToFamily(effectiveCode);
  const simulationValue =
    simulatedWeatherCode == null
      ? "live"
      : weatherCodeToFamily(simulatedWeatherCode);

  // macOS (Aqua / Aqua Glass): pin the text top-left, just under the menu bar.
  // Everything else keeps the PiP-mirroring placement above the dock/taskbar:
  // centered on phones, right-aligned on desktop, lifted above an active PiP.
  const topLeft = isMacOSTheme;
  const shouldCenter = !topLeft && isPhone;
  const isRightAligned = !topLeft && !shouldCenter;
  const overlayStyle = useMemo<CSSProperties>(() => {
    if (topLeft) {
      return {
        top: `calc(env(safe-area-inset-top, 0px) + var(--os-metrics-menubar-height, 25px) + ${WEATHER_TOP_GAP}px)`,
        left: `calc(env(safe-area-inset-left, 0px) + ${WEATHER_LEFT_INSET}px)`,
        textAlign: "left",
        alignItems: "flex-start",
      };
    }
    const base = isWindowsTheme ? WEATHER_BOTTOM_WINDOWS : WEATHER_BOTTOM_DEFAULT;
    const bottomPx = base + (pipActive ? WEATHER_PIP_CLEARANCE : 0);
    const style: CSSProperties = {
      bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottomPx}px)`,
    };
    if (shouldCenter) {
      style.left = "50%";
      style.transform = "translateX(-50%)";
      style.textAlign = "center";
      style.alignItems = "center";
    } else {
      style.right = "12px";
      style.textAlign = "right";
      style.alignItems = "flex-end";
    }
    return style;
  }, [topLeft, isWindowsTheme, shouldCenter, pipActive]);

  // The interactive debug picker is portaled to <body> so it sits above the
  // desktop icons (the wallpaper layer is z-[-10] and otherwise unclickable)
  // but stays BELOW application windows — matching the iPod PiP, which uses
  // z-[1] since windows start at z-index 2+. It reuses the overlay's offsets,
  // nudged to clear the text block.
  const debugSelectStyle = useMemo<CSSProperties>(() => {
    const style: CSSProperties = { position: "fixed", zIndex: 1 };
    if (topLeft) {
      style.top = `calc(env(safe-area-inset-top, 0px) + var(--os-metrics-menubar-height, 25px) + ${WEATHER_TOP_GAP + WEATHER_SELECT_OFFSET}px)`;
      style.left = `calc(env(safe-area-inset-left, 0px) + ${WEATHER_LEFT_INSET}px)`;
      return style;
    }
    const base = isWindowsTheme ? WEATHER_BOTTOM_WINDOWS : WEATHER_BOTTOM_DEFAULT;
    const bottomPx =
      base + (pipActive ? WEATHER_PIP_CLEARANCE : 0) + WEATHER_SELECT_OFFSET;
    style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${bottomPx}px)`;
    if (shouldCenter) {
      style.left = "50%";
      style.transform = "translateX(-50%)";
    } else {
      style.right = "12px";
    }
    return style;
  }, [topLeft, isWindowsTheme, shouldCenter, pipActive]);

  const hasData = effectiveCode != null && temperature != null;
  // Localize the SF fallback (stored with city: null) at the render layer,
  // matching the dashboard widget; real reverse-geocoded cities show as-is.
  const isSfFallback =
    city == null &&
    lat != null &&
    lon != null &&
    Math.abs(lat - SF_LAT) < 0.01 &&
    Math.abs(lon - SF_LON) < 0.01;
  const displayCity =
    city ?? (isSfFallback ? t("apps.dashboard.cities.sanFrancisco") : null);
  const textShadow = "0 1px 4px rgba(0,0,0,0.45)";

  return (
    <div className="absolute inset-0 w-full h-full z-[-10] overflow-hidden">
      {/* Base CSS gradient fallback (also shown if WebGL is unavailable). */}
      <div
        className="absolute inset-0 w-full h-full"
        style={{
          backgroundImage: gradient,
          transition: "background-image 3s linear",
        }}
      />
      {/* Animated procedural weather sky. */}
      <WeatherShaderBackground
        family={family}
        isDay={isDay}
        topColor={colors.top}
        midColor={colors.mid}
        bottomColor={colors.bottom}
        isActive
        className="absolute inset-0 w-full h-full"
      />
      {/* Text overlay: city, temperature, condition. */}
      {hasData && (
        <div
          className="absolute flex flex-col select-none pointer-events-none"
          style={overlayStyle}
        >
          {displayCity && (
            <span
              className="font-medium truncate"
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.9)",
                maxWidth: "70vw",
                textShadow,
                fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              }}
            >
              {displayCity}
            </span>
          )}
          <span
            className="font-light leading-none"
            style={{
              fontSize: 48,
              letterSpacing: "-0.04em",
              color: "#FFF",
              textShadow: "0 2px 10px rgba(0,0,0,0.3)",
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            }}
          >
            {temperature}°
          </span>
          <div
            className="flex items-center gap-1.5"
            style={{
              flexDirection: isRightAligned ? "row-reverse" : "row",
            }}
          >
            <Emoji
              emoji={getWeatherEmoji(effectiveCode ?? 0, isDay)}
              size={18}
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}
            />
            <span
              className="font-medium"
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.85)",
                textShadow,
                fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              }}
            >
              {t(
                `apps.dashboard.weather.conditions.${WEATHER_CONDITION_KEY[family]}`
              )}
            </span>
          </div>
        </div>
      )}
      {debugMode &&
        createPortal(
          <div
            style={{ ...debugSelectStyle, pointerEvents: "auto" }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Select
              value={simulationValue}
              onValueChange={(value) => {
                if (value === "live") {
                  setSimulatedWeatherCode(null);
                  return;
                }
                const match = SIMULATABLE_WEATHER.find(
                  (o) => o.family === value
                );
                setSimulatedWeatherCode(match ? match.code : null);
              }}
            >
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">{t("common.auto")}</SelectItem>
                {SIMULATABLE_WEATHER.map((o) => (
                  <SelectItem key={o.family} value={o.family}>
                    {t(
                      `apps.dashboard.weather.conditions.${WEATHER_CONDITION_KEY[o.family]}`
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>,
          document.body
        )}
    </div>
  );
}

function LyricsWallpaperLayer() {
  const np = useNowPlayingLyrics();
  const videoPlayerRef = useRef<React.ComponentRef<typeof YouTubePlayer>>(null);
  const prevElapsedRef = useRef(np.elapsedSeconds);
  const prevTrackIdRef = useRef(np.track?.id);
  const wallpaperPlaybackRateRef = useRef(1);
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

  const showVideoBackground =
    np.effectiveDisplayMode === DisplayMode.Video &&
    np.isPlaying &&
    np.track?.url &&
    np.track.source !== "appleMusic";

  useEffect(() => {
    if (!showVideoBackground) return;
    const player = videoPlayerRef.current;
    if (!player) return;

    const target = np.elapsedSeconds;
    if (np.track?.id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = np.track?.id;
      prevElapsedRef.current = target;
      wallpaperPlaybackRateRef.current = 1;
    }

    const prevElapsed = prevElapsedRef.current;
    const elapsedJump = Math.abs(target - prevElapsed);
    prevElapsedRef.current = target;

    const current = player.getCurrentTime() ?? 0;
    const drift = target - current;
    const absDrift = Math.abs(drift);

    const setPlaybackRate = (rate: number) => {
      if (wallpaperPlaybackRateRef.current === rate) return;
      try {
        const internalPlayer = player.getInternalPlayer() as
          | { playbackRate?: number }
          | null
          | undefined;
        if (
          internalPlayer &&
          typeof internalPlayer.playbackRate !== "undefined"
        ) {
          internalPlayer.playbackRate = rate;
          wallpaperPlaybackRateRef.current = rate;
        }
      } catch {
        // Some players don't support playbackRate.
      }
    };

    if (
      elapsedJump > WALLPAPER_SEEK_JUMP_THRESHOLD_SEC ||
      absDrift > WALLPAPER_HARD_SEEK_THRESHOLD_SEC ||
      (!np.isPlaying && absDrift > WALLPAPER_SOFT_SYNC_THRESHOLD_SEC)
    ) {
      player.seekTo(target, "seconds");
      setPlaybackRate(1);
      return;
    }

    if (np.isPlaying && absDrift > WALLPAPER_SOFT_SYNC_THRESHOLD_SEC) {
      setPlaybackRate(drift > 0 ? 1.05 : 0.95);
      return;
    }

    setPlaybackRate(1);
  }, [
    np.elapsedSeconds,
    np.isPlaying,
    np.track?.id,
    showVideoBackground,
  ]);

  return (
    <div className="absolute inset-0 w-full h-full z-[-10] overflow-hidden bg-neutral-950">
      {showVideoBackground && (
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <div className="w-full h-[calc(100%+400px)] mt-[-200px]">
            <YouTubePlayer
              ref={videoPlayerRef}
              url={np.track!.url}
              playing={np.isPlaying}
              volume={0}
              width="100%"
              height="100%"
              style={{ pointerEvents: "none" }}
              onReady={() => {
                wallpaperPlaybackRateRef.current = 1;
                videoPlayerRef.current?.seekTo(np.elapsedSeconds, "seconds");
              }}
              config={{
                youtube: {
                  playerVars: {
                    controls: 0,
                    fs: 0,
                  },
                },
              }}
            />
          </div>
        </div>
      )}
      <KaraokeVisualLayers
        effectiveDisplayMode={np.effectiveDisplayMode}
        visualBackgroundActive={np.visualBackgroundActive}
        currentTrack={np.track}
        coverUrl={np.coverUrl}
        isPlaying={np.isPlaying}
        layerClassName="absolute inset-0 w-full h-full"
        coverOverlayClassName="absolute inset-0"
        onCoverInteraction={() => {}}
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
