import { useEffect, useMemo, useState } from "react";
import {
  getTimezoneOffsetMinutes,
  offsetMinutesToLongitude,
} from "@/lib/timezoneConfig";

const DEG2RAD = Math.PI / 180;

/** Viewer tilt (degrees) so the northern hemisphere leans toward the camera. */
const VIEW_TILT_DEG = 18;
/** Sampling step (degrees) when tracing meridian/parallel paths. */
const SAMPLE_STEP_DEG = 3;

type Projected = { x: number; y: number; visible: boolean };

/**
 * Orthographic projection of a lat/lon onto the unit disc. The globe is rotated
 * so `centerLon` faces the viewer; `tilt` rotates the view around the X axis.
 * Returns normalized coordinates in [-1, 1] plus front-hemisphere visibility.
 */
function project(
  lat: number,
  lon: number,
  centerLon: number,
  tilt: number
): Projected {
  const phi = lat * DEG2RAD;
  const lambda = (lon - centerLon) * DEG2RAD;
  const phi1 = tilt * DEG2RAD;

  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosLambda = Math.cos(lambda);
  const sinLambda = Math.sin(lambda);

  const x = cosPhi * sinLambda;
  const y = Math.cos(phi1) * sinPhi - Math.sin(phi1) * cosPhi * cosLambda;
  const cosC = Math.sin(phi1) * sinPhi + Math.cos(phi1) * cosPhi * cosLambda;

  return { x, y, visible: cosC >= 0 };
}

/** Builds SVG path segments for a polyline, splitting where it dips behind. */
function buildPath(
  points: { lat: number; lon: number }[],
  centerLon: number,
  tilt: number,
  cx: number,
  cy: number,
  r: number
): string {
  let path = "";
  let penDown = false;
  for (const { lat, lon } of points) {
    const p = project(lat, lon, centerLon, tilt);
    if (!p.visible) {
      penDown = false;
      continue;
    }
    const sx = cx + p.x * r;
    const sy = cy - p.y * r;
    if (!penDown) {
      path += `M${sx.toFixed(2)},${sy.toFixed(2)}`;
      penDown = true;
    } else {
      path += `L${sx.toFixed(2)},${sy.toFixed(2)}`;
    }
  }
  return path;
}

function meridianPoints(lon: number): { lat: number; lon: number }[] {
  const pts: { lat: number; lon: number }[] = [];
  for (let lat = -90; lat <= 90; lat += SAMPLE_STEP_DEG) {
    pts.push({ lat, lon });
  }
  return pts;
}

function parallelPoints(lat: number): { lat: number; lon: number }[] {
  const pts: { lat: number; lon: number }[] = [];
  for (let lon = -180; lon <= 180; lon += SAMPLE_STEP_DEG) {
    pts.push({ lat, lon });
  }
  return pts;
}

export type InternationalGlobeProps = {
  /** Effective IANA timezone the globe should face. */
  timeZone: string;
  /** Diameter of the rendered SVG in px. */
  size?: number;
  className?: string;
};

/**
 * A retro orthographic wireframe globe that rotates to face the selected
 * timezone's central meridian, marks it with a pin, and shades the night side
 * based on the current sub-solar point. Used by the International control panel.
 */
export function InternationalGlobe({
  timeZone,
  size = 132,
  className,
}: InternationalGlobeProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const uid = useMemo(
    () => timeZone.replace(/[^a-zA-Z0-9]/g, "") || "tz",
    [timeZone]
  );

  const centerLon = useMemo(() => {
    const offset = getTimezoneOffsetMinutes(timeZone, now);
    return offsetMinutesToLongitude(offset);
  }, [timeZone, now]);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  const meridians = useMemo(() => {
    const lons: number[] = [];
    for (let lon = -180; lon < 180; lon += 30) lons.push(lon);
    return lons.map((lon) =>
      buildPath(meridianPoints(lon), centerLon, VIEW_TILT_DEG, cx, cy, r)
    );
  }, [centerLon, cx, cy, r]);

  const parallels = useMemo(() => {
    const lats = [-60, -30, 0, 30, 60];
    return lats.map((lat) => ({
      lat,
      path: buildPath(parallelPoints(lat), centerLon, VIEW_TILT_DEG, cx, cy, r),
    }));
  }, [centerLon, cx, cy, r]);

  // Sub-solar point: where it is solar noon right now (lat ~0 ignoring seasons).
  const sun = useMemo(() => {
    const utcHours =
      now.getUTCHours() +
      now.getUTCMinutes() / 60 +
      now.getUTCSeconds() / 3600;
    const subSolarLon = (12 - utcHours) * 15;
    const p = project(0, subSolarLon, centerLon, VIEW_TILT_DEG);
    return { x: cx + p.x * r, y: cy - p.y * r, visible: p.visible };
  }, [now, centerLon, cx, cy, r]);

  // Marker pin sits on the central meridian (front of the globe), slightly north.
  const marker = useMemo(() => {
    const p = project(18, centerLon, centerLon, VIEW_TILT_DEG);
    return { x: cx + p.x * r, y: cy - p.y * r };
  }, [centerLon, cx, cy, r]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={`Globe centered on ${timeZone}`}
      style={{ display: "block" }}
    >
      <defs>
        <radialGradient id={`ocean-${uid}`} cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#5aa9e6" />
          <stop offset="55%" stopColor="#2f7bbf" />
          <stop offset="100%" stopColor="#143a63" />
        </radialGradient>
        <radialGradient id={`sun-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,247,214,0.9)" />
          <stop offset="40%" stopColor="rgba(255,236,160,0.35)" />
          <stop offset="100%" stopColor="rgba(255,236,160,0)" />
        </radialGradient>
        <clipPath id={`disc-${uid}`}>
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
      </defs>

      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={`url(#ocean-${uid})`}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={1}
      />

      <g clipPath={`url(#disc-${uid})`}>
        {/* Night-side shading: a soft dark wash opposite the sub-solar point. */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="rgba(8,18,38,0.45)"
          style={{
            transition: "opacity 0.6s ease",
            opacity: sun.visible ? 0 : 0.55,
          }}
        />

        {parallels.map(({ lat, path }) => (
          <path
            key={`par-${lat}`}
            d={path}
            fill="none"
            stroke={
              lat === 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.3)"
            }
            strokeWidth={lat === 0 ? 1 : 0.7}
          />
        ))}

        {meridians.map((path, i) => (
          <path
            key={`mer-${i}`}
            d={path}
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={0.7}
          />
        ))}

        {sun.visible && (
          <circle cx={sun.x} cy={sun.y} r={r * 0.9} fill={`url(#sun-${uid})`} />
        )}
      </g>

      {/* Specular highlight for a glassy, lit-from-upper-left look. */}
      <ellipse
        cx={cx - r * 0.32}
        cy={cy - r * 0.42}
        rx={r * 0.4}
        ry={r * 0.26}
        fill="rgba(255,255,255,0.28)"
      />

      {/* Selected-timezone pin. */}
      <g>
        <line
          x1={marker.x}
          y1={marker.y}
          x2={marker.x}
          y2={marker.y - 14}
          stroke="rgba(0,0,0,0.4)"
          strokeWidth={1.5}
        />
        <circle
          cx={marker.x}
          cy={marker.y - 16}
          r={4}
          fill="#ff4d4d"
          stroke="#fff"
          strokeWidth={1.2}
        />
        <circle
          cx={marker.x}
          cy={marker.y}
          r={2}
          fill="rgba(0,0,0,0.45)"
        />
      </g>
    </svg>
  );
}
