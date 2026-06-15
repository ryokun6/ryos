import {
  getWeatherGradientColors,
  weatherCodeToFamily,
  type WeatherFamily,
} from "@/utils/dynamicWallpaper";

export { getWeatherGradientColors, weatherCodeToFamily };
export type { WeatherFamily };

export interface DailyForecast {
  dayLabel: string;
  weatherCode: number;
  tempHigh: number;
}

export interface CityResult {
  name: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
  cityKey?: string;
}

export interface WeatherSnapshotDaily {
  time: string[];
  weatherCode: number[];
  tempMax: number[];
  tempMin: number[];
}

export interface WeatherSnapshot {
  weatherCode: number;
  temperature: number;
  windSpeed: number;
  humidity: number;
  isDay: boolean;
  daily: WeatherSnapshotDaily;
  city: string | null;
  lat: number;
  lon: number;
  fetchedAt: number;
}

export type WeatherLocation =
  | { kind: "coords"; lat: number; lon: number }
  | { kind: "geo" };

export interface CurrentWeatherView {
  weatherCode: number | null;
  isDay: boolean;
  temperature: number | null;
  city: string | null;
  /** Resolved coordinates of the snapshot, or null until loaded. Lets the
   * overlay detect the SF fallback (city null + SF coords) and localize it. */
  lat: number | null;
  lon: number | null;
}
