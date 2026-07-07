/**
 * Shared types + helpers for the `getWeather` chat tool.
 *
 * The executor lives in `api/chat/tools/weather-executor.ts` and reuses the
 * same Open-Meteo / Nominatim client (`src/lib/weather/openMeteo.ts`) that
 * powers the dashboard weather widget and the live-weather wallpaper. These
 * types are shared so the chat UI can render the tool output.
 */

export type GetWeatherLocationSource =
  | "coordinates"
  | "place-search"
  | "ip-geolocation";

export interface GetWeatherInput {
  /** Free-form place name to look up (e.g. "Tokyo", "Paris, France"). */
  location?: string;
  latitude?: number;
  longitude?: number;
  /** Optional BCP-47 language tag for localized place names. */
  language?: string;
}

export interface GetWeatherCurrent {
  temperatureC: number;
  temperatureF: number;
  /** Human-readable condition derived from the WMO weather code. */
  condition: string;
  /** Raw WMO weather interpretation code from Open-Meteo. */
  weatherCode: number;
  windSpeedKmh: number;
  humidityPercent: number;
  isDay: boolean;
}

export interface GetWeatherForecastDay {
  /** ISO date (YYYY-MM-DD) in the location's timezone. */
  date: string;
  condition: string;
  weatherCode: number;
  tempMaxC: number;
  tempMinC: number;
  tempMaxF: number;
  tempMinF: number;
}

export interface GetWeatherOutput {
  success: boolean;
  message: string;
  error?: string;
  location?: {
    city: string | null;
    latitude: number;
    longitude: number;
    source: GetWeatherLocationSource;
  };
  current?: GetWeatherCurrent;
  forecast?: GetWeatherForecastDay[];
}

export const celsiusToFahrenheit = (celsius: number): number =>
  Math.round((celsius * 9) / 5 + 32);

/**
 * Human-readable description for a WMO weather interpretation code
 * (the `weather_code` field Open-Meteo returns).
 */
export function describeWeatherCode(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code === 56 || code === 57) return "Freezing drizzle";
  if (code === 61) return "Light rain";
  if (code === 63) return "Rain";
  if (code === 65) return "Heavy rain";
  if (code === 66 || code === 67) return "Freezing rain";
  if (code === 71) return "Light snow";
  if (code === 73) return "Snow";
  if (code === 75) return "Heavy snow";
  if (code === 77) return "Snow grains";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if (code === 96 || code === 99) return "Thunderstorm with hail";
  return "Unknown";
}
