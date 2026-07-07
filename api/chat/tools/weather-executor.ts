/**
 * Server-side executor for the `getWeather` tool.
 *
 * Reuses the exact Open-Meteo + Nominatim client that powers the dashboard
 * weather widget and the live-weather wallpaper
 * (`src/lib/weather/openMeteo.ts`), so the agent sees the same data the OS
 * surfaces do.
 *
 * Location resolution order:
 *   1. Explicit `latitude`/`longitude` input (e.g. from the `getLocation` tool)
 *   2. `location` place-name search via Nominatim
 *   3. The request's IP-derived geolocation (`context.requestGeo`)
 */

import {
  fetchWeatherPayload,
  reverseGeocodeCity,
  searchCities,
} from "../../../src/lib/weather/openMeteo.js";
import {
  celsiusToFahrenheit,
  describeWeatherCode,
  type GetWeatherInput,
  type GetWeatherLocationSource,
  type GetWeatherOutput,
} from "../../../src/shared/tools/weather.js";
import type { Redis } from "../../_utils/redis.js";
import { checkToolRateLimit } from "./_tool-rate-limit.js";
import type { ServerToolContext } from "./types.js";

/** Identifies ryOS to Nominatim per its usage policy (server-side calls only). */
const GEOCODE_USER_AGENT = "ryOS/1.0 (https://os.ryo.lu)";

const WEATHER_TIMEOUT_MS = 12_000;
const FORECAST_DAYS_IN_OUTPUT = 5;

interface ResolvedLocation {
  latitude: number;
  longitude: number;
  city: string | null;
  source: GetWeatherLocationSource;
}

function coerceCoordinate(value: string | number | undefined): number | null {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) return null;
  return num;
}

/**
 * IP-derived fallback coordinates from the request, mirroring the maps tool.
 * Rejects Null Island (0,0), which Vercel ships for unknown IPs.
 */
function resolveIpLocation(context: ServerToolContext): ResolvedLocation | null {
  const geo = context.requestGeo;
  if (!geo) return null;
  const lat = coerceCoordinate(geo.latitude);
  const lon = coerceCoordinate(geo.longitude);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (lat === 0 && lon === 0) return null;
  return {
    latitude: lat,
    longitude: lon,
    city: geo.city || null,
    source: "ip-geolocation",
  };
}

async function resolveLocation(
  input: GetWeatherInput,
  context: ServerToolContext
): Promise<ResolvedLocation | { error: string; message: string }> {
  if (input.latitude !== undefined && input.longitude !== undefined) {
    return {
      latitude: input.latitude,
      longitude: input.longitude,
      city: null,
      source: "coordinates",
    };
  }

  const query = input.location?.trim();
  if (query) {
    try {
      const cities = await searchCities(
        query,
        AbortSignal.timeout(WEATHER_TIMEOUT_MS),
        input.language,
        { userAgent: GEOCODE_USER_AGENT }
      );
      const match = cities[0];
      if (!match) {
        return {
          error: "location_not_found",
          message: `No place found for "${query}". Try a city name like "Tokyo" or "Paris, France".`,
        };
      }
      const cityLabel = [match.name, match.state, match.country]
        .filter((part): part is string => !!part && part.length > 0)
        .join(", ");
      return {
        latitude: match.lat,
        longitude: match.lon,
        city: cityLabel || match.name || query,
        source: "place-search",
      };
    } catch (error) {
      context.logError(`[getWeather] Place search failed for "${query}"`, error);
      return {
        error: "geocoding_failed",
        message: `Could not look up "${query}" right now. Try again or pass coordinates.`,
      };
    }
  }

  const ipLocation = resolveIpLocation(context);
  if (ipLocation) return ipLocation;

  return {
    error: "no_location",
    message:
      "No location available: pass a 'location' name, pass coordinates, or call getLocation to request the user's precise location.",
  };
}

export async function executeGetWeather(
  input: GetWeatherInput,
  context: ServerToolContext & { username?: string | null; redis?: Redis }
): Promise<GetWeatherOutput> {
  const rateLimit = await checkToolRateLimit("getWeather", context);
  if (!rateLimit.allowed) {
    return {
      success: false,
      message: rateLimit.message!,
      error: "rate_limited",
    };
  }

  const resolved = await resolveLocation(input, context);
  if ("error" in resolved) {
    context.log(`[getWeather] location unresolved: ${resolved.error}`);
    return { success: false, message: resolved.message, error: resolved.error };
  }

  const { latitude, longitude, source } = resolved;
  context.log(
    `[getWeather] fetching lat=${latitude} lon=${longitude} (${source})`
  );

  let payload: Awaited<ReturnType<typeof fetchWeatherPayload>>;
  try {
    payload = await fetchWeatherPayload(latitude, longitude);
  } catch (error) {
    context.logError(`[getWeather] Weather fetch failed`, error);
    return {
      success: false,
      message: "Weather data is unavailable right now. Try again shortly.",
      error: "weather_fetch_failed",
    };
  }

  // Resolve a display city for raw coordinates; best-effort only.
  let city = resolved.city;
  if (!city) {
    try {
      city = await reverseGeocodeCity(latitude, longitude, input.language, {
        userAgent: GEOCODE_USER_AGENT,
      });
    } catch {
      city = null;
    }
  }

  const condition = describeWeatherCode(payload.weatherCode);
  const forecast = payload.daily.time
    .slice(0, FORECAST_DAYS_IN_OUTPUT)
    .map((date, index) => {
      const code = Number(payload.daily.weatherCode[index] ?? 0);
      const maxC = Math.round(Number(payload.daily.tempMax[index] ?? 0));
      const minC = Math.round(Number(payload.daily.tempMin[index] ?? 0));
      return {
        date,
        condition: describeWeatherCode(code),
        weatherCode: code,
        tempMaxC: maxC,
        tempMinC: minC,
        tempMaxF: celsiusToFahrenheit(maxC),
        tempMinF: celsiusToFahrenheit(minC),
      };
    });

  const placeLabel = city || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
  return {
    success: true,
    message: `Current weather in ${placeLabel}: ${condition}, ${payload.temperature}°C (${celsiusToFahrenheit(payload.temperature)}°F).`,
    location: { city, latitude, longitude, source },
    current: {
      temperatureC: payload.temperature,
      temperatureF: celsiusToFahrenheit(payload.temperature),
      condition,
      weatherCode: payload.weatherCode,
      windSpeedKmh: payload.windSpeed,
      humidityPercent: payload.humidity,
      isDay: payload.isDay,
    },
    forecast,
  };
}
