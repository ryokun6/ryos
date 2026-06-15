import type { CityResult, WeatherSnapshot } from "./types";

export function getWeatherEmoji(code: number, isDay = true): string {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code <= 3) return isDay ? "⛅" : "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌧️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  if (code <= 99) return "⛈️";
  return isDay ? "🌤️" : "☁️";
}

type WeatherPayload = Omit<WeatherSnapshot, "city">;

export async function fetchWeatherPayload(
  lat: number,
  lon: number
): Promise<WeatherPayload> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=7`
  );
  if (!res.ok) throw new Error("Weather fetch failed");
  const data = await res.json();
  const daily = data?.daily ?? {};
  return {
    weatherCode: Number(data?.current?.weather_code ?? 0),
    temperature: Math.round(Number(data?.current?.temperature_2m ?? 0)),
    windSpeed: Math.round(Number(data?.current?.wind_speed_10m ?? 0)),
    humidity: Number(data?.current?.relative_humidity_2m ?? 0),
    isDay: data?.current?.is_day === 1,
    daily: {
      time: daily.time ?? [],
      weatherCode: daily.weather_code ?? [],
      tempMax: daily.temperature_2m_max ?? [],
      tempMin: daily.temperature_2m_min ?? [],
    },
    lat,
    lon,
    fetchedAt: Date.now(),
  };
}

export async function reverseGeocodeCity(
  lat: number,
  lon: number
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (
      data?.address?.city ||
      data?.address?.town ||
      data?.address?.village ||
      data?.address?.county ||
      null
    );
  } catch {
    return null;
  }
}

export async function searchCities(
  query: string,
  signal?: AbortSignal
): Promise<CityResult[]> {
  if (query.length < 2) return [];
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query
    )}&format=json&limit=6&addressdetails=1&featuretype=city`,
    { signal }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data
    .filter(
      (r: { type: string; class: string }) =>
        ["city", "town", "village", "administrative"].includes(r.type) ||
        r.class === "place"
    )
    .slice(0, 5)
    .map(
      (r: {
        address?: {
          city?: string;
          town?: string;
          village?: string;
          state?: string;
          country_code?: string;
        };
        display_name?: string;
        lat: string;
        lon: string;
      }): CityResult => ({
        name:
          r.address?.city ||
          r.address?.town ||
          r.address?.village ||
          r.display_name?.split(",")[0] ||
          "",
        country: (r.address?.country_code || "").toUpperCase(),
        state: r.address?.state,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
      })
    );
}
