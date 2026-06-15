import { useWeather } from "@/hooks/useWeather";
import type { CurrentWeatherView } from "@/lib/weather/types";

// Thin wrapper over the shared, persistently-cached weather source for the
// `dynamic://weather` wallpaper. It tracks the device's geolocation and exposes
// only the current view the wallpaper / accent / menubar consume. Pass
// `active: false` to keep it inert (no fetch / no geolocation) — nothing fetches
// at import time, only for active consumers.
export type WeatherWallpaperState = CurrentWeatherView;

export function useWeatherWallpaper(active: boolean = true): CurrentWeatherView {
  const { snapshot } = useWeather({ kind: "geo" }, { active });
  return {
    weatherCode: snapshot?.weatherCode ?? null,
    isDay: snapshot?.isDay ?? true,
    temperature: snapshot?.temperature ?? null,
    city: snapshot?.city ?? null,
    lat: snapshot?.lat ?? null,
    lon: snapshot?.lon ?? null,
  };
}
