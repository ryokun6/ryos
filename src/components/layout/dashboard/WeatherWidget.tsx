import { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type WeatherWidgetConfig } from "@/stores/useDashboardStore";
import { MapPin, MagnifyingGlass, NavigationArrow } from "@phosphor-icons/react";

interface DailyForecast {
  dayLabel: string;
  weatherCode: number;
  tempHigh: number;
}

interface WeatherData {
  temperature: number;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
  isDay: boolean;
  forecast: DailyForecast[];
}

interface CityResult {
  name: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
  cityKey?: string;
}

function getPopularCities(t: TFunction): CityResult[] {
  return [
    { name: t("apps.dashboard.cities.newYork"), country: "US", state: "NY", lat: 40.7128, lon: -74.006, cityKey: "apps.dashboard.cities.newYork" },
    { name: t("apps.dashboard.cities.london"), country: "GB", lat: 51.5074, lon: -0.1278, cityKey: "apps.dashboard.cities.london" },
    { name: t("apps.dashboard.cities.tokyo"), country: "JP", lat: 35.6762, lon: 139.6503, cityKey: "apps.dashboard.cities.tokyo" },
    { name: t("apps.dashboard.cities.paris"), country: "FR", lat: 48.8566, lon: 2.3522, cityKey: "apps.dashboard.cities.paris" },
    { name: t("apps.dashboard.cities.sydney"), country: "AU", lat: -33.8688, lon: 151.2093, cityKey: "apps.dashboard.cities.sydney" },
    { name: t("apps.dashboard.cities.sanFrancisco"), country: "US", state: "CA", lat: 37.7749, lon: -122.4194, cityKey: "apps.dashboard.cities.sanFrancisco" },
    { name: t("apps.dashboard.cities.berlin"), country: "DE", lat: 52.52, lon: 13.405, cityKey: "apps.dashboard.cities.berlin" },
    { name: t("apps.dashboard.cities.singapore"), country: "SG", lat: 1.3521, lon: 103.8198, cityKey: "apps.dashboard.cities.singapore" },
    { name: t("apps.dashboard.cities.shanghai"), country: "CN", lat: 31.2304, lon: 121.4737, cityKey: "apps.dashboard.cities.shanghai" },
    { name: t("apps.dashboard.cities.hongKong"), country: "HK", lat: 22.3193, lon: 114.1694, cityKey: "apps.dashboard.cities.hongKong" },
    { name: t("apps.dashboard.cities.taipei"), country: "TW", lat: 25.033, lon: 121.5654, cityKey: "apps.dashboard.cities.taipei" },
  ];
}


function getWeatherEmoji(code: number, isDay = true): string {
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

function getSkyGradient(code: number, isDay: boolean): string {
  if (!isDay) {
    if (code === 0)
      return "linear-gradient(180deg, #0B1A2E 0%, #1A2D4A 40%, #2A3F5C 100%)";
    if (code <= 3)
      return "linear-gradient(180deg, #0F1F35 0%, #1E3250 40%, #2E4462 100%)";
    if (code <= 48)
      return "linear-gradient(180deg, #1A1E25 0%, #2A303A 40%, #3A424D 100%)";
    if (code <= 67)
      return "linear-gradient(180deg, #0E151E 0%, #1C2630 40%, #2A3540 100%)";
    if (code <= 77)
      return "linear-gradient(180deg, #151C28 0%, #252F3E 40%, #354050 100%)";
    if (code <= 86)
      return "linear-gradient(180deg, #121922 0%, #222C38 40%, #323E4A 100%)";
    if (code <= 99)
      return "linear-gradient(180deg, #0A0F15 0%, #181E28 40%, #252D38 100%)";
    return "linear-gradient(180deg, #0B1A2E 0%, #1A2D4A 40%, #2A3F5C 100%)";
  }
  if (code === 0)
    return "linear-gradient(180deg, #4A90C4 0%, #7AB4D8 40%, #A8CBE0 100%)";
  if (code <= 3)
    return "linear-gradient(180deg, #5A8AAF 0%, #8BAFC5 40%, #B0C8D8 100%)";
  if (code <= 48)
    return "linear-gradient(180deg, #6B7B8D 0%, #8A96A3 40%, #A5AEB8 100%)";
  if (code <= 67)
    return "linear-gradient(180deg, #4A5A6A 0%, #6A7A8A 40%, #8A95A0 100%)";
  if (code <= 77)
    return "linear-gradient(180deg, #7A8A9A 0%, #9AABB8 40%, #C0CDD5 100%)";
  if (code <= 86)
    return "linear-gradient(180deg, #6A7A8A 0%, #8A9AAA 40%, #B0BCC5 100%)";
  if (code <= 99)
    return "linear-gradient(180deg, #3A4550 0%, #505E6A 40%, #6A7880 100%)";
  return "linear-gradient(180deg, #4A90C4 0%, #7AB4D8 40%, #A8CBE0 100%)";
}

const weatherCache = new Map<string, WeatherData>();
const weatherCacheListeners = new Set<() => void>();

function setWeatherCacheEntry(key: string, data: WeatherData) {
  weatherCache.set(key, data);
  weatherCacheListeners.forEach((cb) => cb());
}

function useWeatherCache(widgetId: string): WeatherData | null {
  const subscribe = useCallback(
    (cb: () => void) => {
      weatherCacheListeners.add(cb);
      return () => { weatherCacheListeners.delete(cb); };
    },
    []
  );
  return useSyncExternalStore(subscribe, () => weatherCache.get(widgetId) ?? null);
}

function formatCityLabel(city: CityResult): string {
  const parts = [city.name];
  if (city.state) parts.push(city.state);
  parts.push(city.country);
  return parts.join(", ");
}

interface WeatherWidgetProps {
  widgetId: string;
}

export function WeatherWidget({ widgetId }: WeatherWidgetProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "en";
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const cityConfig = widget?.config as WeatherWidgetConfig | undefined;

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [geoLocationName, setGeoLocationName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const locationName = useMemo(() => {
    if (cityConfig?.cityKey) return t(cityConfig.cityKey);
    if (cityConfig?.cityName) return cityConfig.cityName;
    return geoLocationName;
  }, [cityConfig?.cityKey, cityConfig?.cityName, geoLocationName, t]);

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=7`
      );
      if (!res.ok) throw new Error("Weather fetch failed");
      const data = await res.json();

      const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
      const forecast: DailyForecast[] = [];
      for (let i = 1; i <= 6 && i < data.daily.time.length; i++) {
        const d = new Date(data.daily.time[i] + "T00:00:00");
        forecast.push({
          dayLabel: dayFmt.format(d).toUpperCase(),
          weatherCode: data.daily.weather_code[i],
          tempHigh: Math.round(data.daily.temperature_2m_max[i]),
        });
      }

      const weatherData: WeatherData = {
        temperature: Math.round(data.current.temperature_2m),
        weatherCode: data.current.weather_code,
        windSpeed: Math.round(data.current.wind_speed_10m),
        humidity: data.current.relative_humidity_2m,
        isDay: data.current.is_day === 1,
        temperatureMax: Math.round(data.daily.temperature_2m_max[0]),
        temperatureMin: Math.round(data.daily.temperature_2m_min[0]),
        forecast,
      };
      setWeather(weatherData);
      setWeatherCacheEntry(widgetId, weatherData);

      setLoading(false);
    } catch {
      setError(t("apps.dashboard.weather.unavailable"));
      setLoading(false);
    }
  }, [locale, t, widgetId]);

  const fetchLocationName = useCallback(async (lat: number, lon: number) => {
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
        setGeoLocationName(city);
      }
    } catch {
      // Location name optional
    }
  }, []);

  useEffect(() => {
    setWeather(null);
    setError(null);
    setLoading(true);
    setGeoLocationName("");

    if (cityConfig?.lat != null && cityConfig?.lon != null) {
      fetchWeather(cityConfig.lat, cityConfig.lon);
      return;
    }

    if (!navigator.geolocation) {
      setError(t("apps.dashboard.weather.locationDenied"));
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchWeather(pos.coords.latitude, pos.coords.longitude);
        fetchLocationName(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setError(t("apps.dashboard.weather.enableLocation"));
        setLoading(false);
      },
      { timeout: 10000 }
    );
  }, [cityConfig?.lat, cityConfig?.lon, cityConfig?.cityName, fetchWeather, fetchLocationName, t]);

  const needsCitySelection = !loading && error && !weather;

  if (needsCitySelection) {
    return (
      <div
        className="flex items-center justify-center p-4"
        style={{
          minHeight: 120,
          color: isXpTheme ? "#666" : "rgba(255,255,255,0.45)",
          fontSize: 11,
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        }}
      >
        {t("apps.dashboard.weather.selectCity")}
      </div>
    );
  }

  if (isXpTheme) {
    if (loading)
      return (
        <div
          className="flex items-center justify-center p-4 text-xs text-gray-500"
          style={{ minHeight: 120 }}
        >
          {t("apps.dashboard.weather.loading")}
        </div>
      );
    if (!weather) return null;
    return (
      <div className="p-3 text-black">
        <span
          className="font-bold truncate"
          style={{ fontSize: 14, color: "#888", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
        >
          {locationName || "—"}
        </span>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-2xl">{getWeatherEmoji(weather.weatherCode, weather.isDay)}</span>
          <div>
            <div className="text-xl font-light">{weather.temperature}°</div>
            <div className="text-[10px] text-gray-500">
              {t("apps.dashboard.weather.high")} {weather.temperatureMax}° {t("apps.dashboard.weather.low")} {weather.temperatureMin}°
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          color: "rgba(255,255,255,0.4)",
          minHeight: 180,
          background: "linear-gradient(180deg, #5A8AAF 0%, #8BAFC5 40%, #B0C8D8 100%)",
          borderRadius: "inherit",
        }}
      >
        <span className="text-xs">{t("apps.dashboard.weather.loading")}</span>
      </div>
    );
  }

  if (!weather) return null;

  const textShadow = "0 1px 3px rgba(0,0,0,0.4)";

  return (
    <div
      className="flex flex-col flex-1"
      style={{ borderRadius: "inherit" }}
    >
      <div
        className="relative px-3 py-3 flex flex-1"
        style={{ background: getSkyGradient(weather.weatherCode, weather.isDay) }}
      >
        <div className="flex flex-col justify-center flex-1 min-w-0" style={{ zIndex: 1, marginTop: -8 }}>
          <div
            className="font-medium"
            style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", textShadow, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
          >
            {t("apps.dashboard.weather.high")} {weather.temperatureMax}°
          </div>
          <span
            className="font-bold truncate"
            style={{
              fontSize: 14,
              color: "#FFF",
              maxWidth: 180,
              textShadow: "0 1px 3px rgba(0,0,0,0.4)",
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            }}
          >
            {locationName || "—"}
          </span>
          <div
            className="font-medium"
            style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", textShadow, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
          >
            {t("apps.dashboard.weather.low")} {weather.temperatureMin}°
          </div>
        </div>

        <div className="flex items-center shrink-0" style={{ marginTop: -8 }}>
          <span
            className="font-light leading-none"
            style={{
              fontSize: 64,
              letterSpacing: "-0.04em",
              color: "#FFF",
              textShadow: "0 2px 8px rgba(0,0,0,0.25)",
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            }}
          >
            {weather.temperature}°
          </span>
        </div>
      </div>

      {weather.forecast.length > 0 && (
        <div>
          <div
            className="flex"
            style={{
              background: weather.isDay
                ? "linear-gradient(180deg, rgba(100,140,180,0.7) 0%, rgba(80,120,160,0.6) 100%)"
                : "linear-gradient(180deg, rgba(30,45,65,0.8) 0%, rgba(20,35,55,0.7) 100%)",
              borderTop: "1px solid rgba(255,255,255,0.15)",
              borderBottom: "1px solid rgba(0,0,0,0.15)",
            }}
          >
            {weather.forecast.map((day) => (
              <div key={day.dayLabel} className="flex-1 text-center py-1">
                <span
                  className="font-bold tracking-wide"
                  style={{ fontSize: 11, color: "#FFF", textShadow: "0 1px 2px rgba(0,0,0,0.3)", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
                >
                  {day.dayLabel}
                </span>
              </div>
            ))}
          </div>

          <div
            className="flex"
            style={{
              background: weather.isDay
                ? "linear-gradient(180deg, rgba(50,60,75,0.85) 0%, rgba(35,45,55,0.9) 100%)"
                : "linear-gradient(180deg, rgba(15,22,35,0.9) 0%, rgba(10,16,28,0.95) 100%)",
            }}
          >
            {weather.forecast.map((day) => (
              <div key={day.dayLabel} className="flex-1 flex flex-col items-center py-2 gap-1">
                <span style={{ fontSize: 24, lineHeight: 1 }}>
                  {getWeatherEmoji(day.weatherCode)}
                </span>
                <span
                  className="font-semibold"
                  style={{ fontSize: 16, color: "rgba(255,255,255,0.85)", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
                >
                  {day.tempHigh}°
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function WeatherEmojiOverflow({ widgetId }: { widgetId: string }) {
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const weather = useWeatherCache(widgetId);
  if (!weather || !widget) return null;

  return (
    <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none" style={{ top: -21, zIndex: 10 }}>
      <span style={{ fontSize: 100, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))", opacity: 0.9 }}>
        {getWeatherEmoji(weather.weatherCode, weather.isDay)}
      </span>
    </div>
  );
}

// Back panel: city picker for the weather widget settings
export function WeatherBackPanel({ widgetId, onDone }: { widgetId: string; onDone?: () => void }) {
  const { t } = useTranslation();
  const popularCities = useMemo(() => getPopularCities(t), [t]);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CityResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchCities = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1&featuretype=city`
      );
      if (res.ok) {
        const data = await res.json();
        const results: CityResult[] = data
          .filter((r: { type: string; class: string }) =>
            ["city", "town", "village", "administrative"].includes(r.type) || r.class === "place"
          )
          .slice(0, 5)
          .map((r: { address?: { city?: string; town?: string; village?: string; state?: string; country_code?: string }; display_name?: string; lat: string; lon: string }) => ({
            name: r.address?.city || r.address?.town || r.address?.village || r.display_name?.split(",")[0] || "",
            country: (r.address?.country_code || "").toUpperCase(),
            state: r.address?.state,
            lat: parseFloat(r.lat),
            lon: parseFloat(r.lon),
          }));
        setSearchResults(results);
      }
    } catch {
      // search failed silently
    }
    setSearching(false);
  }, []);

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => searchCities(value), 300);
    },
    [searchCities]
  );

  const selectCity = useCallback(
    (city: CityResult) => {
      updateWidgetConfig(widgetId, { cityName: city.name, cityKey: city.cityKey, lat: city.lat, lon: city.lon } as WeatherWidgetConfig);
      onDone?.();
    },
    [widgetId, updateWidgetConfig, onDone]
  );

  const useMyLocation = useCallback(() => {
    updateWidgetConfig(widgetId, undefined);
    onDone?.();
  }, [widgetId, updateWidgetConfig, onDone]);

  const citiesToShow = searchQuery.length >= 2 ? searchResults : popularCities;
  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.8)";

  return (
    <div onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="flex items-center gap-1.5 px-3 py-1.5"
        style={{ borderBottom: isXpTheme ? "1px solid #D5D2CA" : "1px solid rgba(255,255,255,0.08)" }}
      >
        <MagnifyingGlass size={12} weight="bold" style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.35)", flexShrink: 0 }} />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder={t("apps.dashboard.weather.searchCity")}
          className="flex-1 bg-transparent outline-none text-[11px]"
          style={{ color: textColor, caretColor: isXpTheme ? "#000" : "rgba(255,255,255,0.7)" }}
        />
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
        <button
          type="button"
          onClick={useMyLocation}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left transition-colors"
          style={{
            borderBottom: isXpTheme ? "1px solid #EAE8E1" : "1px solid rgba(255,255,255,0.05)",
            color: isXpTheme ? "#0066CC" : "rgba(130,180,255,0.9)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = isXpTheme ? "rgba(0,102,204,0.08)" : "rgba(255,255,255,0.06)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <NavigationArrow size={11} weight="fill" style={{ flexShrink: 0 }} />
          <span className="text-[11px] font-medium">{t("apps.dashboard.weather.useMyLocation")}</span>
        </button>

        {searching ? (
          <div className="px-3 py-3 text-center text-[10px]" style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.3)" }}>
            {t("apps.dashboard.weather.searching")}
          </div>
        ) : searchQuery.length >= 2 && citiesToShow.length === 0 ? (
          <div className="px-3 py-3 text-center text-[10px]" style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.3)" }}>
            {t("apps.dashboard.weather.noResults")}
          </div>
        ) : (
          citiesToShow.map((city, i) => (
            <button
              key={`${city.lat}-${city.lon}-${i}`}
              type="button"
              onClick={() => selectCity(city)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.background = isXpTheme ? "rgba(0,102,204,0.08)" : "rgba(255,255,255,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <MapPin size={10} weight="fill" style={{ color: isXpTheme ? "#999" : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
              <span className="text-[11px] truncate" style={{ color: textColor }}>{formatCityLabel(city)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
