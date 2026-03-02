import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "@/stores/useThemeStore";

interface WeatherData {
  temperature: number;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
}

// WMO Weather Codes → emoji
function getWeatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌧️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  if (code <= 99) return "⛈️";
  return "🌤️";
}

function getWeatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly Cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain Showers";
  if (code <= 86) return "Snow Showers";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

export function WeatherWidget() {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
      );
      if (!res.ok) throw new Error("Weather fetch failed");
      const data = await res.json();

      setWeather({
        temperature: Math.round(data.current.temperature_2m),
        weatherCode: data.current.weather_code,
        windSpeed: Math.round(data.current.wind_speed_10m),
        humidity: data.current.relative_humidity_2m,
        temperatureMax: Math.round(data.daily.temperature_2m_max[0]),
        temperatureMin: Math.round(data.daily.temperature_2m_min[0]),
      });

      // Reverse geocode for city name (nominatim)
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          const city =
            geoData.address?.city ||
            geoData.address?.town ||
            geoData.address?.village ||
            geoData.address?.county ||
            "";
          setLocationName(city);
        }
      } catch {
        // Silently fail — location name is optional
      }

      setLoading(false);
    } catch {
      setError("Weather unavailable");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError(t("apps.dashboard.weather.locationDenied"));
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchWeather(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setError(t("apps.dashboard.weather.enableLocation"));
        setLoading(false);
      },
      { timeout: 10000 }
    );
  }, [fetchWeather, t]);

  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.9)";
  const dimColor = isXpTheme ? "#666" : "rgba(255,255,255,0.5)";

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4" style={{ color: dimColor, minHeight: 140 }}>
        <span className="text-xs">{t("apps.dashboard.weather.loading")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-4 text-center" style={{ color: dimColor, minHeight: 140 }}>
        <span className="text-xs">{error}</span>
      </div>
    );
  }

  if (!weather) return null;

  return (
    <div className="p-3 flex flex-col gap-1" style={{ color: textColor }}>
      {/* Location */}
      {locationName && (
        <div className="text-xs font-medium truncate" style={{ color: dimColor }}>
          {locationName}
        </div>
      )}

      {/* Main temp + icon */}
      <div className="flex items-center gap-2">
        <span className="text-3xl leading-none">
          {getWeatherEmoji(weather.weatherCode)}
        </span>
        <div>
          <div className="text-2xl font-light leading-none">
            {weather.temperature}°
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: dimColor }}>
            {getWeatherLabel(weather.weatherCode)}
          </div>
        </div>
      </div>

      {/* High / Low */}
      <div className="flex gap-3 text-[10px] mt-1" style={{ color: dimColor }}>
        <span>H: {weather.temperatureMax}°</span>
        <span>L: {weather.temperatureMin}°</span>
      </div>

      {/* Details row */}
      <div className="flex gap-3 text-[10px]" style={{ color: dimColor }}>
        <span>{t("apps.dashboard.weather.humidity")}: {weather.humidity}%</span>
        <span>{t("apps.dashboard.weather.wind")}: {weather.windSpeed} km/h</span>
      </div>
    </div>
  );
}
