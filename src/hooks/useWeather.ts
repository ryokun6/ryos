import { useEffect } from "react";
import {
  coordKey,
  SF_LAT,
  SF_LON,
  useWeatherStore,
  WEATHER_TTL_MS,
} from "@/stores/useWeatherStore";
import type {
  DailyForecast,
  WeatherLocation,
  WeatherSnapshot,
  WeatherSnapshotDaily,
} from "@/lib/weather/types";

export interface UseWeatherResult {
  snapshot: WeatherSnapshot | null;
  loading: boolean;
  error: string | null;
}

export function buildForecast(
  daily: WeatherSnapshotDaily,
  locale: string
): DailyForecast[] {
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const forecast: DailyForecast[] = [];
  for (let i = 1; i <= 6 && i < daily.time.length; i++) {
    const d = new Date(daily.time[i] + "T00:00:00");
    forecast.push({
      dayLabel: dayFmt.format(d).toUpperCase(),
      weatherCode: daily.weatherCode[i],
      tempHigh: Math.round(daily.tempMax[i]),
    });
  }
  return forecast;
}

export function useWeather(
  location: WeatherLocation,
  opts?: { active?: boolean }
): UseWeatherResult {
  const active = opts?.active ?? true;
  const locKind = location.kind;
  const locLat = location.kind === "coords" ? location.lat : undefined;
  const locLon = location.kind === "coords" ? location.lon : undefined;

  const geoCoords = useWeatherStore((s) => s.geoCoords);
  const geoFailed = useWeatherStore((s) => s.geoFailed);
  const ensureWeather = useWeatherStore((s) => s.ensureWeather);

  // For geo: use resolved coords immediately (instant SWR, no prompt); only key
  // into the SF fallback once geolocation has actually failed. While geo is
  // pending (no coords, not yet failed) the key is null so we stay loading
  // instead of reporting an unrelated SF-coordinate cache as resolved.
  let key: string | null;
  if (locKind === "coords") {
    key = coordKey(locLat as number, locLon as number);
  } else if (geoCoords) {
    key = coordKey(geoCoords.lat, geoCoords.lon);
  } else if (geoFailed) {
    key = coordKey(SF_LAT, SF_LON);
  } else {
    key = null;
  }

  const snapshot = useWeatherStore((s) => (key ? s.entries[key] ?? null : null));
  const error = useWeatherStore((s) => (key ? s.errors[key] ?? null : null));

  useEffect(() => {
    if (!active) return;
    const loc: WeatherLocation =
      locKind === "coords"
        ? { kind: "coords", lat: locLat as number, lon: locLon as number }
        : { kind: "geo" };
    ensureWeather(loc);
    const id = window.setInterval(() => ensureWeather(loc), WEATHER_TTL_MS);
    return () => window.clearInterval(id);
  }, [active, locKind, locLat, locLon, ensureWeather]);

  return {
    snapshot,
    loading: active && !snapshot && !error,
    error,
  };
}
