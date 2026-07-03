import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useWeatherWallpaper } from "@/hooks/useWeatherWallpaper";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useIpodPipActive } from "@/apps/ipod/hooks/useIpodPipActive";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useWeatherSimulationStore } from "@/stores/useWeatherSimulationStore";
import { SF_LAT, SF_LON } from "@/stores/useWeatherStore";
import { WeatherShaderBackground } from "@/components/shared/WeatherShaderBackground";
import { getWeatherEmoji } from "@/lib/weather/openMeteo";
import { Emoji } from "@/components/shared/Emoji";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getWeatherGradientColors,
  getWeatherGradientCss,
  weatherCodeToFamily,
  type WeatherFamily,
} from "@/utils/dynamicWallpaper";

/** Recompute the weather gradient roughly once a minute. */
const GRADIENT_REFRESH_MS = 60 * 1000;

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

export function WeatherGradientLayer() {
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
