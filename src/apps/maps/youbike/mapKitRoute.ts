import type { GeoPoint } from "./types";

export type MapKitTransportKind = "Walking" | "Cycling";

interface MapKitLikeCoordinate {
  latitude?: unknown;
  longitude?: unknown;
}

interface MapKitLikeRoute {
  path?: unknown;
  polyline?: { points?: unknown; path?: unknown } | unknown;
  distance?: unknown;
  expectedTravelTime?: unknown;
  steps?: unknown;
}

export interface MapKitRouteStep {
  instruction: string;
  streetName: string;
  distanceMeters: number;
}

function asPoint(value: unknown): GeoPoint | null {
  if (!value || typeof value !== "object") return null;
  const coord = value as MapKitLikeCoordinate;
  const latitude = Number(coord.latitude);
  const longitude = Number(coord.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function asPointList(value: unknown): GeoPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map(asPoint).filter((point): point is GeoPoint => point !== null);
}

/**
 * MapKit JS walking routes expose `path`. WWDC25 cycling samples also
 * return a `polyline` overlay (`points` / `path`). Accept either.
 */
export function extractMapKitRoutePath(route: unknown): GeoPoint[] {
  if (!route || typeof route !== "object") return [];
  const typed = route as MapKitLikeRoute;
  const fromPath = asPointList(typed.path);
  if (fromPath.length >= 2) return fromPath;
  const polyline = typed.polyline;
  if (polyline && typeof polyline === "object") {
    const overlay = polyline as { points?: unknown; path?: unknown };
    const fromPoints = asPointList(overlay.points);
    if (fromPoints.length >= 2) return fromPoints;
    const fromOverlayPath = asPointList(overlay.path);
    if (fromOverlayPath.length >= 2) return fromOverlayPath;
  }
  return [];
}

export function extractMapKitRouteMetrics(route: unknown): {
  distanceMeters?: number;
  durationSeconds?: number;
} {
  if (!route || typeof route !== "object") return {};
  const typed = route as MapKitLikeRoute;
  return {
    distanceMeters:
      typeof typed.distance === "number" && Number.isFinite(typed.distance)
        ? typed.distance
        : undefined,
    durationSeconds:
      typeof typed.expectedTravelTime === "number" &&
      Number.isFinite(typed.expectedTravelTime)
        ? typed.expectedTravelTime
        : undefined,
  };
}

/** Turn-by-turn rows from a MapKit JS route (`steps[].instructions`). */
export function extractMapKitRouteSteps(route: unknown): MapKitRouteStep[] {
  if (!route || typeof route !== "object") return [];
  const steps = (route as MapKitLikeRoute).steps;
  if (!Array.isArray(steps)) return [];
  const parsed: MapKitRouteStep[] = [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const record = step as {
      instructions?: unknown;
      distance?: unknown;
      name?: unknown;
    };
    const instruction =
      typeof record.instructions === "string" ? record.instructions.trim() : "";
    const streetName = typeof record.name === "string" ? record.name.trim() : "";
    if (!instruction && !streetName) continue;
    const distanceMeters =
      typeof record.distance === "number" && Number.isFinite(record.distance)
        ? record.distance
        : 0;
    parsed.push({
      instruction: instruction || streetName,
      streetName,
      distanceMeters,
    });
  }
  return parsed;
}

/** Resolve MapKit JS `Directions.Transport` values, including WWDC25 Cycling. */
export function resolveMapKitTransport(
  directions: { Transport?: Record<string, string> } | undefined,
  kind: MapKitTransportKind
): string | null {
  const transport = directions?.Transport;
  if (kind === "Cycling") {
    return transport?.Cycling ?? transport?.cycling ?? "Cycling";
  }
  return transport?.Walking ?? transport?.walking ?? "Walking";
}
