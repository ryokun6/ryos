import { useEffect, useState } from "react";

// Lightweight live-weather source for the `dynamic://weather` wallpaper. We only
// need the current WMO weather code (the gradient derives time-of-day on its own
// from the wall clock), so this is intentionally much smaller than the Dashboard
// weather widget. Results are cached at module scope so toggling the wallpaper
// on/off doesn't re-prompt for geolocation or re-hit the API.

export interface WeatherWallpaperState {
  weatherCode: number | null;
  isDay: boolean;
}

interface WeatherWallpaperCacheEntry {
  weatherCode: number;
  isDay: boolean;
  fetchedAt: number;
}

const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const SF_LAT = 37.7749;
const SF_LON = -122.4194;

let cache: WeatherWallpaperCacheEntry | null = null;
let inFlight: Promise<WeatherWallpaperCacheEntry | null> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
}

async function fetchWeather(
  lat: number,
  lon: number
): Promise<WeatherWallpaperCacheEntry | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,is_day&timezone=auto`
    );
    if (!res.ok) throw new Error("Weather fetch failed");
    const data = await res.json();
    const entry: WeatherWallpaperCacheEntry = {
      weatherCode: Number(data?.current?.weather_code ?? 0),
      isDay: data?.current?.is_day === 1,
      fetchedAt: Date.now(),
    };
    cache = entry;
    notify();
    return entry;
  } catch {
    return null;
  }
}

function resolveCoordsThenFetch(): Promise<WeatherWallpaperCacheEntry | null> {
  return new Promise((resolve) => {
    const done = (lat: number, lon: number) => resolve(fetchWeather(lat, lon));
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      done(SF_LAT, SF_LON);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => done(pos.coords.latitude, pos.coords.longitude),
      () => done(SF_LAT, SF_LON),
      { timeout: 10000, maximumAge: WEATHER_REFRESH_MS }
    );
  });
}

function ensureFresh() {
  const isStale = !cache || Date.now() - cache.fetchedAt > WEATHER_REFRESH_MS;
  if (!isStale || inFlight) return;
  inFlight = resolveCoordsThenFetch().finally(() => {
    inFlight = null;
  });
}

/**
 * Provides the current local weather condition for the weather wallpaper.
 * Returns `weatherCode: null` until the first fetch resolves (the gradient
 * renderer treats this as a plain day/night sky).
 */
export function useWeatherWallpaper(): WeatherWallpaperState {
  const [state, setState] = useState<WeatherWallpaperState>(() => ({
    weatherCode: cache?.weatherCode ?? null,
    isDay: cache?.isDay ?? true,
  }));

  useEffect(() => {
    const sync = () =>
      setState({
        weatherCode: cache?.weatherCode ?? null,
        isDay: cache?.isDay ?? true,
      });
    listeners.add(sync);
    ensureFresh();
    sync();

    const id = setInterval(() => {
      ensureFresh();
    }, WEATHER_REFRESH_MS);

    return () => {
      listeners.delete(sync);
      clearInterval(id);
    };
  }, []);

  return state;
}
