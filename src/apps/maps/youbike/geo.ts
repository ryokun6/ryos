import type { GeoBBox, GeoPoint } from "./types";

/** Mainland + nearby islands bounding box used to gate the overlay. */
export const TAIWAN_BBOX: GeoBBox = {
  south: 21.7,
  west: 119.2,
  north: 25.4,
  east: 122.15,
};

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValidCoordinate(point: GeoPoint): boolean {
  return (
    isFiniteCoordinate(point.latitude) &&
    isFiniteCoordinate(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

export function isInBBox(point: GeoPoint, bbox: GeoBBox): boolean {
  return (
    point.latitude >= bbox.south &&
    point.latitude <= bbox.north &&
    point.longitude >= bbox.west &&
    point.longitude <= bbox.east
  );
}

export function isInTaiwan(point: GeoPoint): boolean {
  return isValidCoordinate(point) && isInBBox(point, TAIWAN_BBOX);
}

export function bboxIntersectsTaiwan(bbox: GeoBBox): boolean {
  return !(
    bbox.north < TAIWAN_BBOX.south ||
    bbox.south > TAIWAN_BBOX.north ||
    bbox.east < TAIWAN_BBOX.west ||
    bbox.west > TAIWAN_BBOX.east
  );
}

export function padBBox(bbox: GeoBBox, factor: number): GeoBBox {
  const latPad = Math.max(0, bbox.north - bbox.south) * factor;
  const lngPad = Math.max(0, bbox.east - bbox.west) * factor;
  return {
    south: bbox.south - latPad,
    west: bbox.west - lngPad,
    north: bbox.north + latPad,
    east: bbox.east + lngPad,
  };
}

export function bboxContains(outer: GeoBBox, inner: GeoBBox): boolean {
  return (
    inner.south >= outer.south &&
    inner.north <= outer.north &&
    inner.west >= outer.west &&
    inner.east <= outer.east
  );
}

export function filterStationsInBBox<T extends GeoPoint>(
  stations: T[],
  bbox: GeoBBox
): T[] {
  return stations.filter((station) => isInBBox(station, bbox));
}

/** Typical urban walking speed (~5 km/h). */
export const WALK_SPEED_MPS = 1.4;
/** Typical YouBike cruising speed (~15 km/h). */
export const BIKE_SPEED_MPS = 4.17;

export function estimateDurationSeconds(
  distanceMeters: number,
  speedMps: number
): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
  if (!Number.isFinite(speedMps) || speedMps <= 0) return 0;
  return Math.round(distanceMeters / speedMps);
}

/**
 * Evenly sample a great-circle path so MapKit can stroke a smooth bike
 * hop without a cycling directions API.
 */
export function interpolateGreatCircle(
  from: GeoPoint,
  to: GeoPoint,
  segments = 16
): GeoPoint[] {
  const count = Math.max(1, Math.floor(segments));
  if (count === 1) return [from, to];
  const path: GeoPoint[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    path.push({
      latitude: from.latitude + (to.latitude - from.latitude) * t,
      longitude: from.longitude + (to.longitude - from.longitude) * t,
    });
  }
  return path;
}

export function parseBBoxQuery(query: {
  south?: unknown;
  west?: unknown;
  north?: unknown;
  east?: unknown;
}): GeoBBox | null {
  const south = Number(query.south);
  const west = Number(query.west);
  const north = Number(query.north);
  const east = Number(query.east);
  if (
    !isFiniteCoordinate(south) ||
    !isFiniteCoordinate(west) ||
    !isFiniteCoordinate(north) ||
    !isFiniteCoordinate(east)
  ) {
    return null;
  }
  if (south >= north || west >= east) return null;
  if (south < -90 || north > 90 || west < -180 || east > 180) return null;
  return { south, west, north, east };
}
