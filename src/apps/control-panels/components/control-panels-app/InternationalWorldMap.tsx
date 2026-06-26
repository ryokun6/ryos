import { useEffect, useMemo, useState } from "react";
import {
  geoEquirectangular,
  geoPath,
  geoGraticule10,
  geoCircle,
} from "d3-geo";
import type { FeatureCollection } from "geojson";
import {
  getTimezoneOffsetMinutes,
  offsetMinutesToLongitude,
} from "@/lib/timezoneConfig";
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
  /** Effective IANA timezone whose meridian is highlighted. */
  timeZone: string;
  className?: string;
};

/**
 * A flat equirectangular world map (classic Mac OS X "Time Zone" style) drawn
 * with d3-geo. Renders continents, a graticule, a live day/night shadow, and a
 * marker on the selected timezone's central meridian.
 */
export function InternationalWorldMap({
  timeZone,
  className,
}: InternationalWorldMapProps) {
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
    const offset = getTimezoneOffsetMinutes(timeZone, now);
    const lon = offsetMinutesToLongitude(offset);
    const point = projection([lon, 0]);
    return { x: point ? point[0] : MAP_W / 2, lon };
  }, [projection, timeZone, now]);

  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      className={className}
      role="img"
      aria-label={`World map highlighting ${timeZone}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <defs>
        <linearGradient id="cp-ocean" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b6ea5" />
          <stop offset="100%" stopColor="#244b73" />
        </linearGradient>
      </defs>

      <rect
        x={0}
        y={0}
        width={MAP_W}
        height={MAP_H}
        fill="url(#cp-ocean)"
      />

      <path
        d={graticulePath}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={0.3}
      />

      <path
        d={landPath}
        fill="#6f9e5a"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={0.3}
      />

      {/* Live day/night shadow. */}
      <path d={nightPath} fill="rgba(8,16,34,0.42)" stroke="none" />

      {/* Selected timezone meridian + marker. */}
      <line
        x1={marker.x}
        y1={0}
        x2={marker.x}
        y2={MAP_H}
        stroke="rgba(255,90,70,0.55)"
        strokeWidth={0.8}
        strokeDasharray="2 2"
      />
      <circle
        cx={marker.x}
        cy={MAP_H / 2}
        r={3}
        fill="#ff4d4d"
        stroke="#fff"
        strokeWidth={1}
      />

      <rect
        x={0.5}
        y={0.5}
        width={MAP_W - 1}
        height={MAP_H - 1}
        fill="none"
        stroke="rgba(0,0,0,0.4)"
        strokeWidth={1}
      />
    </svg>
  );
}
