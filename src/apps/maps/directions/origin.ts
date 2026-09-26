import { isValidCoordinate } from "../youbike/geo";
import type { GeoPoint } from "../youbike/types";

/** Ignore a map-center origin that is essentially the destination pin. */
export const DIRECTIONS_ORIGIN_MIN_DELTA_DEG = 0.002;

export function pickDirectionsOrigin(input: {
  userLocation?: GeoPoint | null;
  geoLocation?: GeoPoint | null;
  home?: GeoPoint | null;
  work?: GeoPoint | null;
  mapCenter?: GeoPoint | null;
  destination: GeoPoint;
  minDeltaDeg?: number;
}): GeoPoint | { error: "no_origin" } {
  const minDelta = input.minDeltaDeg ?? DIRECTIONS_ORIGIN_MIN_DELTA_DEG;
  const candidates = [
    input.userLocation,
    input.geoLocation,
    input.home,
    input.work,
  ];
  for (const candidate of candidates) {
    if (candidate && isValidCoordinate(candidate)) return candidate;
  }

  const center = input.mapCenter;
  if (center && isValidCoordinate(center) && isDistinctFrom(center, input.destination, minDelta)) {
    return center;
  }
  return { error: "no_origin" };
}

export function isDistinctFrom(
  a: GeoPoint,
  b: GeoPoint,
  minDeltaDeg = DIRECTIONS_ORIGIN_MIN_DELTA_DEG
): boolean {
  return (
    Math.abs(a.latitude - b.latitude) > minDeltaDeg ||
    Math.abs(a.longitude - b.longitude) > minDeltaDeg
  );
}
