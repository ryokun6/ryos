import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  geoEquirectangular,
  geoPath,
  geoGraticule10,
  geoCircle,
} from "d3-geo";
import type { FeatureCollection } from "geojson";
import {
  findClosestTimezone,
  getTimezoneCoordinates,
} from "@/lib/timezoneConfig";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";
import worldLandRaw from "./data/worldLand.json";

const worldLand = worldLandRaw as unknown as FeatureCollection;

/** Equirectangular canvas dimensions (2:1). The SVG scales to its container. */
const MAP_W = 360;
const MAP_H = 180;

/** Approximate solar declination (degrees) for the given date. */
function solarDeclination(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000);
  return -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365.25);
}

/** Longitude (deg, [-180,180]) where the sun is currently overhead. */
function subSolarLongitude(date: Date): number {
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  let lon = 15 * (12 - utcHours);
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

export type InternationalWorldMapProps = {
  /** Effective IANA timezone whose city is highlighted. */
  timeZone: string;
  /** When set, clicks pick the closest IANA zone and call this (manual preference). */
  onSelectTimezone?: (timeZone: string) => void;
  className?: string;
};

/**
 * A flat equirectangular world map (classic Mac OS X "Time Zone" style) drawn
 * with d3-geo. Marker sits on the zone's principal city when known. Optional
 * click selects the nearest supported zone by city coordinates.
 */
export function InternationalWorldMap({
  timeZone,
  onSelectTimezone,
  className,
}: InternationalWorldMapProps) {
  const { isDarkMode } = useThemeFlags();
  const [now, setNow] = useState(() => new Date());

  // Day/night drifts slowly — refresh once a minute is plenty.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const { projection, path } = useMemo(() => {
    const proj = geoEquirectangular()
      .scale(MAP_W / (2 * Math.PI))
      .translate([MAP_W / 2, MAP_H / 2]);
    return { projection: proj, path: geoPath(proj) };
  }, []);

  const landPath = useMemo(() => path(worldLand) ?? "", [path]);
  const graticulePath = useMemo(() => path(geoGraticule10()) ?? "", [path]);

  const nightPath = useMemo(() => {
    const decl = solarDeclination(now);
    let antiLon = subSolarLongitude(now) + 180;
    while (antiLon > 180) antiLon -= 360;
    const night = geoCircle()
      .center([antiLon, -decl])
      .radius(90)();
    return path(night) ?? "";
  }, [path, now]);

  const marker = useMemo(() => {
    const { longitude, latitude } = getTimezoneCoordinates(timeZone, now);
    const point = projection([longitude, latitude]);
    const meridian = projection([longitude, 0]);
    return {
      x: point ? point[0] : MAP_W / 2,
      y: point ? point[1] : MAP_H / 2,
      meridianX: meridian ? meridian[0] : MAP_W / 2,
    };
  }, [projection, timeZone, now]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!onSelectTimezone) return;
      // Ensure keyboard focus ring appears after click (overflow clips SVG outline).
      event.currentTarget.focus({ preventScroll: true });

      const svg = event.currentTarget;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      // Map CSS pixels → viewBox coordinates (preserveAspectRatio meet).
      const scale = Math.min(rect.width / MAP_W, rect.height / MAP_H);
      const offsetX = (rect.width - MAP_W * scale) / 2;
      const offsetY = (rect.height - MAP_H * scale) / 2;
      const x = (event.clientX - rect.left - offsetX) / scale;
      const y = (event.clientY - rect.top - offsetY) / scale;
      if (x < 0 || x > MAP_W || y < 0 || y > MAP_H) return;

      const inverted = projection.invert?.([x, y]);
      if (!inverted) return;
      const [lon, lat] = inverted;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

      onSelectTimezone(findClosestTimezone(lon, { latitude: lat, date: now }));
    },
    [onSelectTimezone, projection, now]
  );

  const interactive = Boolean(onSelectTimezone);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[5px]",
        interactive &&
          "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--os-accent-color,#0a84ff)] focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
      )}
    >
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className={cn(
          className,
          interactive && "outline-none focus:outline-none"
        )}
        role={interactive ? "button" : "img"}
        tabIndex={interactive ? 0 : undefined}
        aria-label={
          interactive
            ? `World map for ${timeZone}. Click to set the closest time zone.`
            : `World map highlighting ${timeZone}`
        }
        preserveAspectRatio="xMidYMid meet"
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          cursor: interactive ? "crosshair" : undefined,
          touchAction: interactive ? "manipulation" : undefined,
        }}
        onPointerDown={interactive ? handlePointerDown : undefined}
      >
        {/* Sea: a neutral, semi-transparent tint so the panel surface shows
            through (works on both light and dark window backgrounds). */}
        <rect
          x={0}
          y={0}
          width={MAP_W}
          height={MAP_H}
          fill="rgba(127,127,127,0.12)"
        />

        <path
          d={graticulePath}
          fill="none"
          stroke="rgba(127,127,127,0.25)"
          strokeWidth={0.3}
          style={{ pointerEvents: "none" }}
        />

        {/* Land: tinted with the OS accent color. `--os-accent-color` is only set
            for non-default accents, so fall back to the classic map green for the
            "System"/default accent. */}
        <path
          d={landPath}
          fillOpacity={0.6}
          stroke="rgba(0,0,0,0.3)"
          strokeWidth={0.3}
          style={{
            fill: "var(--os-accent-color, #6f9e5a)",
            pointerEvents: "none",
          }}
        />

        {/* Live day/night shadow — lighter on light chrome, stronger in dark mode. */}
        <path
          d={nightPath}
          fill={isDarkMode ? "rgba(0,0,0,0.38)" : "rgba(0,0,0,0.14)"}
          stroke="none"
          style={{ pointerEvents: "none" }}
        />

        {/* Meridian through the city longitude; marker at city lat/lon. */}
        <line
          x1={marker.meridianX}
          y1={0}
          x2={marker.meridianX}
          y2={MAP_H}
          style={{
            stroke: "var(--os-accent-color, #ff5a46)",
            pointerEvents: "none",
          }}
          strokeOpacity={0.7}
          strokeWidth={0.8}
          strokeDasharray="2 2"
        />
        <circle
          cx={marker.x}
          cy={marker.y}
          r={3.2}
          style={{
            fill: "var(--os-accent-color, #ff4d4d)",
            pointerEvents: "none",
          }}
          stroke="#fff"
          strokeWidth={1.1}
        />
      </svg>
    </div>
  );
}
