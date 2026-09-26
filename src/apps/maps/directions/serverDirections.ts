import { isValidCoordinate } from "../youbike/geo";
import type { GeoPoint } from "../youbike/types";
import { roundCoord } from "../youbike/bikeRoute";
import type { DirectionsMode, DirectionsRoutePlan, DirectionsStepKind } from "./types";

export const MAPS_DIRECTIONS_CACHE_TTL_SECONDS = 15 * 60;
export const MAPS_DIRECTIONS_TIMEOUT_MS = 10_000;

export type ServerDirectionsTransport = "Automobile" | "Transit";

export interface ParsedDirectionsQuery {
  from: GeoPoint;
  to: GeoPoint;
  mode: DirectionsMode;
}

function asPoint(value: unknown): GeoPoint | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { latitude?: unknown; longitude?: unknown };
  const point = {
    latitude: Number(record.latitude),
    longitude: Number(record.longitude),
  };
  return isValidCoordinate(point) ? point : null;
}

function asPointList(value: unknown): GeoPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map(asPoint).filter((point): point is GeoPoint => point !== null);
}

export function parseDirectionsQuery(query: {
  fromLat?: unknown;
  fromLng?: unknown;
  toLat?: unknown;
  toLng?: unknown;
  mode?: unknown;
}): ParsedDirectionsQuery | { error: string } {
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
  const raw = typeof query.mode === "string" ? query.mode.trim().toLowerCase() : "drive";
  const mode: DirectionsMode =
    raw === "transit" || raw === "r" ? "transit" : "drive";
  return { from, to, mode };
}

export function mapsDirectionsCacheKey(
  from: GeoPoint,
  to: GeoPoint,
  mode: DirectionsMode
): string {
  const a = `${roundCoord(from.latitude)},${roundCoord(from.longitude)}`;
  const b = `${roundCoord(to.latitude)},${roundCoord(to.longitude)}`;
  return `cache:maps:directions:v1:${mode}:${a}:${b}`;
}

export function serverTransportForMode(mode: DirectionsMode): ServerDirectionsTransport {
  return mode === "transit" ? "Transit" : "Automobile";
}

export function stepKindFromTransport(
  mode: DirectionsMode,
  transportType?: string
): DirectionsStepKind {
  const kind = (transportType ?? "").toLowerCase();
  if (kind.includes("walk")) return "walk";
  if (mode === "transit") return "transit";
  return "drive";
}

/**
 * Normalize Apple Maps Server API `/v1/directions` into the in-app plan
 * shape. Routes reference `steps` via `stepIndexes`; steps reference
 * `stepPaths` via `stepPathIndex`.
 */
export function parseAppleMapsServerDirections(
  payload: unknown,
  options: {
    mode: DirectionsMode;
    origin: GeoPoint;
    destination: GeoPoint;
    destinationLabel: string;
  }
): DirectionsRoutePlan | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as {
    routes?: unknown;
    steps?: unknown;
    stepPaths?: unknown;
  };
  if (!Array.isArray(body.routes) || body.routes.length === 0) return null;

  const allSteps = Array.isArray(body.steps) ? body.steps : [];
  const allPaths = Array.isArray(body.stepPaths) ? body.stepPaths : [];
  const route = body.routes[0] as {
    distanceMeters?: unknown;
    durationSeconds?: unknown;
    stepIndexes?: unknown;
  };
  const indexes = Array.isArray(route.stepIndexes)
    ? route.stepIndexes.filter((value): value is number => typeof value === "number")
    : allSteps.map((_, index) => index);

  const steps = [];
  const path: GeoPoint[] = [];
  for (const index of indexes) {
    const raw = allSteps[index];
    if (!raw || typeof raw !== "object") continue;
    const step = raw as {
      stepPathIndex?: unknown;
      distanceMeters?: unknown;
      durationSeconds?: unknown;
      instructions?: unknown;
      name?: unknown;
      transportType?: unknown;
    };
    const instruction =
      typeof step.instructions === "string" ? step.instructions.trim() : "";
    const streetName = typeof step.name === "string" ? step.name.trim() : "";
    const stepPath =
      typeof step.stepPathIndex === "number"
        ? asPointList(allPaths[step.stepPathIndex])
        : [];
    if (stepPath.length > 0) {
      if (path.length > 0 && pointsEqual(path[path.length - 1]!, stepPath[0]!)) {
        path.push(...stepPath.slice(1));
      } else {
        path.push(...stepPath);
      }
    }
    if (!instruction && !streetName && stepPath.length < 2) continue;
    steps.push({
      kind: stepKindFromTransport(
        options.mode,
        typeof step.transportType === "string" ? step.transportType : undefined
      ),
      instruction: instruction || streetName,
      streetName,
      distanceMeters:
        typeof step.distanceMeters === "number" && Number.isFinite(step.distanceMeters)
          ? step.distanceMeters
          : 0,
      durationSeconds:
        typeof step.durationSeconds === "number" && Number.isFinite(step.durationSeconds)
          ? step.durationSeconds
          : 0,
      ...(stepPath[0] ? { location: stepPath[0] } : {}),
      ...(stepPath.length >= 2 ? { path: stepPath } : {}),
    });
  }

  const fallbackPath = path.length >= 2 ? path : [options.origin, options.destination];
  const distanceMeters =
    typeof route.distanceMeters === "number" && Number.isFinite(route.distanceMeters)
      ? route.distanceMeters
      : 0;
  const durationSeconds =
    typeof route.durationSeconds === "number" && Number.isFinite(route.durationSeconds)
      ? route.durationSeconds
      : 0;
  if (fallbackPath.length < 2 && steps.length === 0) return null;

  return {
    mode: options.mode,
    origin: options.origin,
    destination: options.destination,
    destinationLabel: options.destinationLabel,
    path: fallbackPath,
    distanceMeters,
    durationSeconds,
    steps,
    provider: "maps-server",
  };
}

function pointsEqual(a: GeoPoint, b: GeoPoint): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}
