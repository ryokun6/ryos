import { haversineMeters, isInTaiwan, isValidCoordinate } from "./geo";
import type { GeoPoint } from "./types";

export const YOUBIKE_BIKE_ROUTE_CACHE_TTL_SECONDS = 30 * 60;
export const YOUBIKE_BIKE_ROUTE_MAX_METERS = 50_000;
export const YOUBIKE_BIKE_ROUTE_TIMEOUT_MS = 8_000;

/** FOSSGIS public OSRM bike profile — no API key. */
export const DEFAULT_OSRM_BIKE_URL =
  "https://routing.openstreetmap.de/routed-bike/route/v1/driving/{fromLng},{fromLat};{toLng},{toLat}?overview=full&geometries=geojson";

export interface BikeRouteResult {
  path: GeoPoint[];
  distanceMeters: number;
  durationSeconds: number;
  provider: string;
}

export interface BikeRouteQuery {
  from: GeoPoint;
  to: GeoPoint;
}

export function roundCoord(value: number, decimals = 5): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function youbikeBikeRouteCacheKey(from: GeoPoint, to: GeoPoint): string {
  const a = `${roundCoord(from.latitude)},${roundCoord(from.longitude)}`;
  const b = `${roundCoord(to.latitude)},${roundCoord(to.longitude)}`;
  return `cache:youbike:route:v1:${a}:${b}`;
}

export function parseBikeRouteQuery(query: {
  fromLat?: unknown;
  fromLng?: unknown;
  toLat?: unknown;
  toLng?: unknown;
}): BikeRouteQuery | { error: string } {
  const from = {
    latitude: Number(query.fromLat),
    longitude: Number(query.fromLng),
  };
  const to = {
    latitude: Number(query.toLat),
    longitude: Number(query.toLng),
  };
  if (!isValidCoordinate(from) || !isValidCoordinate(to)) {
    return { error: "invalid_coordinates" };
  }
  if (!isInTaiwan(from) || !isInTaiwan(to)) {
    return { error: "not_in_taiwan" };
  }
  if (haversineMeters(from, to) > YOUBIKE_BIKE_ROUTE_MAX_METERS) {
    return { error: "too_far" };
  }
  return { from, to };
}

export function buildOsrmBikeUrl(
  from: GeoPoint,
  to: GeoPoint,
  template = DEFAULT_OSRM_BIKE_URL
): string {
  return template
    .replaceAll("{fromLat}", String(from.latitude))
    .replaceAll("{fromLng}", String(from.longitude))
    .replaceAll("{toLat}", String(to.latitude))
    .replaceAll("{toLng}", String(to.longitude));
}

function asLngLatPair(value: unknown): GeoPoint | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  const point = { latitude, longitude };
  return isValidCoordinate(point) ? point : null;
}

/**
 * Parse an OSRM-style route payload (GeoJSON LineString geometry).
 * Rejects 2-point straight hops so a geodesic fallback cannot sneak through.
 */
export function parseOsrmRoute(
  payload: unknown,
  provider = "osrm-bike"
): BikeRouteResult | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as {
    code?: unknown;
    routes?: Array<{
      distance?: unknown;
      duration?: unknown;
      geometry?: { type?: unknown; coordinates?: unknown };
    }>;
  };
  if (root.code !== undefined && root.code !== "Ok") return null;
  const route = root.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const path = coordinates
    .map(asLngLatPair)
    .filter((point): point is GeoPoint => point !== null);
  if (path.length < 8) return null;
  const distanceMeters =
    typeof route?.distance === "number" && Number.isFinite(route.distance)
      ? route.distance
      : path.slice(1).reduce((sum, point, index) => {
          return sum + haversineMeters(path[index], point);
        }, 0);
  const durationSeconds =
    typeof route?.duration === "number" && Number.isFinite(route.duration)
      ? Math.round(route.duration)
      : 0;
  return {
    path,
    distanceMeters,
    durationSeconds,
    provider,
  };
}
