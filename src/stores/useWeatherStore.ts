import { STORE_STORAGE_KEYS } from "@/config/storageKeys";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  fetchWeatherPayload,
  reverseGeocodeCity,
} from "@/lib/weather/openMeteo";
import type { WeatherLocation, WeatherSnapshot } from "@/lib/weather/types";

export const WEATHER_TTL_MS = 15 * 60 * 1000;
const MAX_PERSISTED_ENTRIES = 20;
export const SF_LAT = 37.7749;
export const SF_LON = -122.4194;

export const coordKey = (lat: number, lon: number): string =>
  `${lat.toFixed(3)},${lon.toFixed(3)}`;

const SF_EPSILON = 1e-3;
const isSfCoords = (lat: number, lon: number): boolean =>
  Math.abs(lat - SF_LAT) < SF_EPSILON && Math.abs(lon - SF_LON) < SF_EPSILON;

export interface WeatherStoreState {
  entries: Record<string, WeatherSnapshot>;
  geoCoords: { lat: number; lon: number } | null;
  // Ephemeral (not persisted): true once geolocation has failed/denied this
  // session, so consumers may fall back to the SF coordinate cache. While null
  // geoCoords + geoFailed false, geo is still pending → consumers stay loading.
  geoFailed: boolean;
  errors: Record<string, string>;
  ensureWeather: (
    location: WeatherLocation,
    opts?: { force?: boolean }
  ) => void;
}

// Non-persisted, module-scope internals: request dedup + geo-resolution guards.
const inFlight = new Map<string, Promise<void>>();
let geoResolving = false;
let lastGeoRefreshAt = 0;

function setEntry(key: string, snapshot: WeatherSnapshot) {
  useWeatherStore.setState((s) => ({
    entries: { ...s.entries, [key]: snapshot },
    errors: (() => {
      if (!(key in s.errors)) return s.errors;
      const next = { ...s.errors };
      delete next[key];
      return next;
    })(),
  }));
}

function setError(key: string, message: string) {
  useWeatherStore.setState((s) => ({
    errors: { ...s.errors, [key]: message },
  }));
}

function refresh(lat: number, lon: number, force = false) {
  const key = coordKey(lat, lon);
  const existing = useWeatherStore.getState().entries[key];
  const isFresh = existing && Date.now() - existing.fetchedAt <= WEATHER_TTL_MS;
  if (!force && isFresh) return;
  if (inFlight.has(key)) return;

  const sfFallback = isSfCoords(lat, lon);
  const promise = (async () => {
    const payload = await fetchWeatherPayload(lat, lon);
    const prevCity = useWeatherStore.getState().entries[key]?.city ?? null;
    setEntry(key, { ...payload, city: sfFallback ? null : prevCity });
    if (!sfFallback && !prevCity) {
      const city = await reverseGeocodeCity(lat, lon);
      if (city) {
        const cur = useWeatherStore.getState().entries[key];
        if (cur) setEntry(key, { ...cur, city });
      }
    }
  })()
    .catch(() => {
      if (!useWeatherStore.getState().entries[key]) {
        setError(key, "Weather unavailable");
      }
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
}

function resolveGeoThenFetch(force: boolean) {
  if (geoResolving) return;
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    useWeatherStore.setState({ geoFailed: true });
    refresh(SF_LAT, SF_LON, force);
    return;
  }
  geoResolving = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      geoResolving = false;
      const { latitude, longitude } = pos.coords;
      useWeatherStore.setState({
        geoCoords: { lat: latitude, lon: longitude },
        geoFailed: false,
      });
      refresh(latitude, longitude, force);
    },
    () => {
      geoResolving = false;
      useWeatherStore.setState({ geoFailed: true });
      refresh(SF_LAT, SF_LON, force);
    },
    { timeout: 10000, maximumAge: WEATHER_TTL_MS }
  );
}

// Re-resolve the device position in the background (no prompt when permission
// was already granted) and re-key if it moved materially.
function refreshDevicePosition() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  const now = Date.now();
  if (now - lastGeoRefreshAt < WEATHER_TTL_MS) return;
  lastGeoRefreshAt = now;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const prev = useWeatherStore.getState().geoCoords;
      if (!prev || coordKey(prev.lat, prev.lon) !== coordKey(latitude, longitude)) {
        useWeatherStore.setState({
          geoCoords: { lat: latitude, lon: longitude },
        });
        refresh(latitude, longitude, false);
      }
    },
    () => {},
    { timeout: 10000, maximumAge: WEATHER_TTL_MS }
  );
}

export const useWeatherStore = create<WeatherStoreState>()(
  persist(
    (_set, get) => ({
      entries: {},
      geoCoords: null,
      geoFailed: false,
      errors: {},
      ensureWeather: (location, opts) => {
        const force = opts?.force ?? false;
        if (location.kind === "coords") {
          refresh(location.lat, location.lon, force);
          return;
        }
        if (typeof navigator === "undefined") {
          useWeatherStore.setState({ geoFailed: true });
          refresh(SF_LAT, SF_LON, force);
          return;
        }
        const persisted = get().geoCoords;
        if (persisted) {
          refresh(persisted.lat, persisted.lon, force);
          refreshDevicePosition();
          return;
        }
        resolveGeoThenFetch(force);
      },
    }),
    {
      name: STORE_STORAGE_KEYS.weather,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const entries = Object.entries(state.entries)
          .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
          .slice(0, MAX_PERSISTED_ENTRIES);
        return {
          entries: Object.fromEntries(entries),
          geoCoords: state.geoCoords,
        };
      },
    }
  )
);
