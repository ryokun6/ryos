import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { Emoji } from "@/components/shared/Emoji";
import { getWeatherEmoji } from "@/lib/weather/openMeteo";
import { getSkyGradient } from "@/lib/weather/skyGradient";
import { weatherCodeToFamily } from "@/utils/dynamicWallpaper";
import type {
  GetWeatherCurrent,
  GetWeatherForecastDay,
  GetWeatherOutput,
} from "@/shared/tools/weather";
import { cn } from "@/lib/utils";
import { toolInlineCardShellClassName } from "@/components/shared/toolInlineCardShell";

export interface WeatherToolCardProps {
  location?: GetWeatherOutput["location"];
  current: GetWeatherCurrent;
  forecast?: GetWeatherForecastDay[];
  /** Extra classes merged onto the card shell (e.g. compact-host overrides). */
  className?: string;
}

const HERO_TEXT_SHADOW = "0 1px 3px rgba(0,0,0,0.4)";

/**
 * Inline chat card rendered when the assistant calls `getWeather`.
 *
 * Mirrors the look of the dashboard weather widget inside the same themed
 * card shell as the Maps places card: a sky-gradient hero band with the
 * city, condition, and current temperature, plus an upcoming-days forecast
 * strip on the card surface.
 */
export function WeatherToolCard({
  location,
  current,
  forecast,
  className,
}: WeatherToolCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "en";
  const { isMacOSTheme, isWindowsTheme, isSystem7Theme, isWin98 } =
    useThemeFlags();

  const conditionLabel = t(
    `apps.dashboard.weather.conditions.${weatherCodeToFamily(current.weatherCode)}`,
    { defaultValue: current.condition }
  );

  // The tool's forecast starts with today: today's high/low feed the hero
  // band and the strip shows the upcoming days, like the dashboard widget.
  const today = forecast?.[0];
  const upcomingDays = useMemo(() => {
    if (!forecast || forecast.length <= 1) return [];
    const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return forecast.slice(1).map((day) => ({
      ...day,
      dayLabel: dayFmt.format(new Date(`${day.date}T00:00:00`)).toUpperCase(),
    }));
  }, [forecast, locale]);

  return (
    <div
      className={cn(
        toolInlineCardShellClassName({
          isMacOSTheme,
          isSystem7Theme,
          isWindowsTheme,
          isWin98,
        }),
        className
      )}
    >
      <div
        className="relative flex items-center gap-3 px-3 py-2.5 text-white"
        style={{
          background: getSkyGradient(current.weatherCode, current.isDay),
        }}
      >
        <Emoji
          emoji={getWeatherEmoji(current.weatherCode, current.isDay)}
          size={38}
          className="shrink-0"
          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}
        />
        <div className="min-w-0 flex-1">
          {location?.city && (
            <div
              className="truncate text-[13px] font-bold leading-tight"
              style={{ textShadow: HERO_TEXT_SHADOW }}
            >
              {location.city}
            </div>
          )}
          <div
            className="truncate text-[11px] font-medium leading-snug"
            style={{ color: "rgba(255,255,255,0.9)", textShadow: HERO_TEXT_SHADOW }}
          >
            {conditionLabel}
          </div>
          {today && (
            <div
              className="text-[11px] font-medium leading-snug"
              style={{ color: "rgba(255,255,255,0.8)", textShadow: HERO_TEXT_SHADOW }}
            >
              {t("apps.dashboard.weather.high")} {today.tempMaxC}°{" "}
              {t("apps.dashboard.weather.low")} {today.tempMinC}°
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span
            className="font-light leading-none"
            style={{
              fontSize: 34,
              letterSpacing: "-0.03em",
              textShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}
          >
            {Math.round(current.temperatureC)}°
          </span>
          <span
            className="mt-0.5 text-[11px] font-medium leading-none"
            style={{ color: "rgba(255,255,255,0.8)", textShadow: HERO_TEXT_SHADOW }}
          >
            {Math.round(current.temperatureF)}°F
          </span>
        </div>
      </div>

      {upcomingDays.length > 0 && (
        <div
          className={cn(
            "flex border-t border-black/10 px-1 py-1.5",
            "os-mac-aqua-dark:border-[color:var(--os-color-separator)]"
          )}
        >
          {upcomingDays.map((day) => (
            <div
              key={day.date}
              className="flex flex-1 flex-col items-center gap-0.5"
              title={day.condition}
            >
              <span className="text-[10px] font-bold tracking-wide text-os-text-secondary">
                {day.dayLabel}
              </span>
              <Emoji emoji={getWeatherEmoji(day.weatherCode)} size={20} />
              <span className="text-[11px] leading-none">
                <span className="font-semibold text-os-text-primary">
                  {day.tempMaxC}°
                </span>{" "}
                <span className="text-os-text-secondary">{day.tempMinC}°</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
