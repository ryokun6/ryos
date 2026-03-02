import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type ClockWidgetConfig } from "@/stores/useDashboardStore";
import { MapPin, MagnifyingGlass, NavigationArrow } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

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

function getCityFromTimezone(tz?: string): string {
  try {
    const timezone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const city = timezone.split("/").pop() || "";
    return city.replace(/_/g, " ").toUpperCase();
  } catch {
    return "";
  }
}

function handPolygon(
  cx: number,
  cy: number,
  angleDeg: number,
  length: number,
  baseHalf: number,
  tailLength = 0,
): string {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const perpRad = rad + Math.PI / 2;
  const tipX = cx + length * Math.cos(rad);
  const tipY = cy + length * Math.sin(rad);
  const bx1 = cx + baseHalf * Math.cos(perpRad);
  const by1 = cy + baseHalf * Math.sin(perpRad);
  const bx2 = cx - baseHalf * Math.cos(perpRad);
  const by2 = cy - baseHalf * Math.sin(perpRad);
  if (tailLength > 0) {
    const tx = cx - tailLength * Math.cos(rad);
    const ty = cy - tailLength * Math.sin(rad);
    return `${bx1},${by1} ${tipX},${tipY} ${bx2},${by2} ${tx},${ty}`;
  }
  return `${bx1},${by1} ${tipX},${tipY} ${bx2},${by2}`;
}

interface ClockWidgetProps {
  widgetId?: string;
}

export function ClockWidget({ widgetId }: ClockWidgetProps) {
  const { t } = useTranslation();
  const [time, setTime] = useState(new Date());
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const widget = useDashboardStore((s) => widgetId ? s.widgets.find((w) => w.id === widgetId) : undefined);
  const config = widget?.config as ClockWidgetConfig | undefined;
  const isDark = config?.style === "dark";

  const cityName = useMemo(() => {
    if (config?.cityKey) return t(config.cityKey).toUpperCase();
    if (config?.cityName) return config.cityName.toUpperCase();
    return getCityFromTimezone(config?.timezone) || t("apps.dashboard.cities.local");
  }, [config?.cityKey, config?.cityName, config?.timezone, t]);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const displayTime = useMemo(() => {
    if (!config?.timezone) return time;
    try {
      const str = time.toLocaleString("en-US", { timeZone: config.timezone });
      return new Date(str);
    } catch {
      return time;
    }
  }, [time, config?.timezone]);

  const hours = displayTime.getHours();
  const minutes = displayTime.getMinutes();
  const seconds = displayTime.getSeconds();

  const secondAngle = (seconds / 60) * 360;
  const minuteAngle = (minutes / 60) * 360 + (seconds / 60) * 6;
  const hourAngle = ((hours % 12) / 12) * 360 + (minutes / 60) * 30;
  const h12 = hours % 12 || 12;
  const digitalTime = `${h12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;

  const svgSize = 170;
  const clockCenterX = svgSize / 2;
  const clockCenterY = svgSize / 2;
  const topLabelY = 15;
  const bottomLabelY = svgSize - 10;
  const faceRadius = isXpTheme ? 52 : 55;

  const gradId = `faceGrad-${widgetId || "default"}`;
  const shadowId = `clockShadow-${widgetId || "default"}`;

  const faceFill = isXpTheme
    ? (isDark ? "#1A1A1A" : "#FFFFFF")
    : (isDark ? `url(#${gradId})` : `url(#${gradId})`);
  const numeralFill = isDark ? "#EEE" : "#333";
  const handFill = isDark ? "#EEE" : "#222";
  const labelFill = isXpTheme
    ? (isDark ? "#EEE" : "#000")
    : (isDark ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.7)");
  const bottomLabelFill = isXpTheme
    ? (isDark ? "#EEE" : "#000")
    : (isDark ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.8)");

  return (
    <svg
      width={svgSize}
      height={svgSize}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      style={{ display: "block" }}
    >
      <defs>
        {!isXpTheme && (
          <>
            <radialGradient id={gradId} cx="50%" cy="38%" r="58%">
              {isDark ? (
                <>
                  <stop offset="0%" stopColor="#2A2A2A" />
                  <stop offset="100%" stopColor="#111" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#f8f8f8" />
                  <stop offset="100%" stopColor="#ddd" />
                </>
              )}
            </radialGradient>
            <filter id={shadowId} x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
            </filter>
          </>
        )}
      </defs>

      <text
        x={clockCenterX}
        y={topLabelY}
        textAnchor="middle"
        fontSize={11}
        fontWeight="700"
        fill={labelFill}
        style={{ fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif" }}
      >
        {digitalTime}
      </text>

      <circle
        cx={clockCenterX}
        cy={clockCenterY}
        r={faceRadius}
        fill={faceFill}
        stroke={isXpTheme ? (isDark ? "#444" : "#808080") : "none"}
        strokeWidth={isXpTheme ? 1.5 : 0}
        filter={isXpTheme ? undefined : `url(#${shadowId})`}
      />

      {/* Tick marks for dark mode (instead of numerals for a cleaner look) */}
      {isDark && !isXpTheme
        ? Array.from({ length: 12 }, (_, i) => {
            const angle = ((i * 30 - 90) * Math.PI) / 180;
            const outerR = faceRadius - 8;
            const innerR = i % 3 === 0 ? faceRadius - 18 : faceRadius - 14;
            return (
              <line
                key={i}
                x1={clockCenterX + innerR * Math.cos(angle)}
                y1={clockCenterY + innerR * Math.sin(angle)}
                x2={clockCenterX + outerR * Math.cos(angle)}
                y2={clockCenterY + outerR * Math.sin(angle)}
                stroke="rgba(255,255,255,0.6)"
                strokeWidth={i % 3 === 0 ? 2 : 1}
                strokeLinecap="round"
              />
            );
          })
        : Array.from({ length: 12 }, (_, i) => {
            const num = i === 0 ? 12 : i;
            const angle = ((num * 30 - 90) * Math.PI) / 180;
            const r = faceRadius - 15;
            return (
              <text
                key={num}
                x={clockCenterX + r * Math.cos(angle)}
                y={clockCenterY + r * Math.sin(angle)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={14}
                fontWeight="700"
                fill={numeralFill}
                style={{ fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif" }}
              >
                {num}
              </text>
            );
          })}

      <polygon
        points={handPolygon(clockCenterX, clockCenterY, hourAngle, 28, 3.5, 5)}
        fill={handFill}
      />

      <polygon
        points={handPolygon(clockCenterX, clockCenterY, minuteAngle, 40, 2.5, 5)}
        fill={handFill}
      />

      <line
        x1={clockCenterX - 10 * Math.cos(((secondAngle - 90) * Math.PI) / 180)}
        y1={clockCenterY - 10 * Math.sin(((secondAngle - 90) * Math.PI) / 180)}
        x2={clockCenterX + 46 * Math.cos(((secondAngle - 90) * Math.PI) / 180)}
        y2={clockCenterY + 46 * Math.sin(((secondAngle - 90) * Math.PI) / 180)}
        stroke="#D95030"
        strokeWidth={1}
        strokeLinecap="round"
      />

      <circle cx={clockCenterX} cy={clockCenterY} r={6} fill="#D95030" />
      <circle cx={clockCenterX} cy={clockCenterY} r={2.5} fill={isDark ? "#222" : "#FFF"} />

      <text
        x={clockCenterX}
        y={bottomLabelY}
        textAnchor="middle"
        fontSize={12}
        fontWeight="700"
        fill={bottomLabelFill}
        style={{ fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif" }}
      >
        {cityName}
      </text>
    </svg>
  );
}

function formatCityLabel(city: CityResult): string {
  const parts = [city.name];
  if (city.state) parts.push(city.state);
  parts.push(city.country);
  return parts.join(", ");
}

export function ClockBackPanel({ widgetId, onDone }: { widgetId: string; onDone?: () => void }) {
  const { t } = useTranslation();
  const popularCities = useMemo(() => getPopularCities(t), [t]);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const clockConfig = widget?.config as ClockWidgetConfig | undefined;
  const isDark = clockConfig?.style === "dark";

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
    async (city: CityResult) => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m&timezone=auto&forecast_days=1`
        );
        if (res.ok) {
          const data = await res.json();
          const tz = data.timezone as string;
          updateWidgetConfig(widgetId, { timezone: tz, cityName: city.name, cityKey: city.cityKey } as ClockWidgetConfig);
          onDone?.();
          return;
        }
      } catch {
        // fall through
      }
      updateWidgetConfig(widgetId, { cityName: city.name, cityKey: city.cityKey } as ClockWidgetConfig);
      onDone?.();
    },
    [widgetId, updateWidgetConfig, onDone]
  );

  const useMyLocation = useCallback(() => {
    updateWidgetConfig(widgetId, undefined);
    onDone?.();
  }, [widgetId, updateWidgetConfig, onDone]);

  const toggleStyle = useCallback(() => {
    const newStyle = isDark ? "light" : "dark";
    updateWidgetConfig(widgetId, { ...clockConfig, style: newStyle } as ClockWidgetConfig);
  }, [isDark, widgetId, clockConfig, updateWidgetConfig]);

  const citiesToShow = searchQuery.length >= 2 ? searchResults : popularCities;
  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.8)";

  return (
    <div onPointerDown={(e) => e.stopPropagation()}>
      {/* Style toggle */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: isXpTheme ? "1px solid #D5D2CA" : "1px solid rgba(255,255,255,0.08)" }}
      >
        <span className="text-[10px] font-medium" style={{ color: textColor }}>
          {t("apps.dashboard.clock.style", "Style")}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={toggleStyle}
            className="flex gap-1 text-[9px] font-bold rounded px-2 py-0.5"
            style={{
              background: !isDark
                ? (isXpTheme ? "rgba(0,102,204,0.1)" : "rgba(255,255,255,0.15)")
                : "transparent",
              color: !isDark
                ? (isXpTheme ? "#0066CC" : "rgba(130,180,255,0.9)")
                : (isXpTheme ? "#888" : "rgba(255,255,255,0.4)"),
              border: "none",
              cursor: "pointer",
            }}
          >
            ☀️ {t("apps.dashboard.clock.light", "Light")}
          </button>
          <button
            type="button"
            onClick={toggleStyle}
            className="flex gap-1 text-[9px] font-bold rounded px-2 py-0.5"
            style={{
              background: isDark
                ? (isXpTheme ? "rgba(0,102,204,0.1)" : "rgba(255,255,255,0.15)")
                : "transparent",
              color: isDark
                ? (isXpTheme ? "#0066CC" : "rgba(130,180,255,0.9)")
                : (isXpTheme ? "#888" : "rgba(255,255,255,0.4)"),
              border: "none",
              cursor: "pointer",
            }}
          >
            🌙 {t("apps.dashboard.clock.dark", "Dark")}
          </button>
        </div>
      </div>

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

      <div className="overflow-y-auto" style={{ maxHeight: 120 }}>
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
