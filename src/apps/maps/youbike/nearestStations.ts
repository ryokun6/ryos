import { haversineMeters } from "./geo";
import type { GeoPoint, YouBikeStation } from "./types";

export const DEFAULT_MAX_STATION_WALK_METERS = 1500;
export const DEFAULT_CANDIDATE_LIMIT = 8;

export interface NearestStationOptions {
  maxDistanceMeters?: number;
  requireBikes?: boolean;
  requireDocks?: boolean;
  excludeIds?: Iterable<string>;
  limit?: number;
}

export interface RankedYouBikeStation {
  station: YouBikeStation;
  distanceMeters: number;
}

function excludeSet(ids: Iterable<string> | undefined): Set<string> {
  return ids ? new Set(ids) : new Set();
}

export function rankNearbyStations(
  origin: GeoPoint,
  stations: YouBikeStation[],
  options: NearestStationOptions = {}
): RankedYouBikeStation[] {
  const maxDistance = options.maxDistanceMeters ?? DEFAULT_MAX_STATION_WALK_METERS;
  const limit = options.limit ?? DEFAULT_CANDIDATE_LIMIT;
  const excluded = excludeSet(options.excludeIds);
  const ranked: RankedYouBikeStation[] = [];

  for (const station of stations) {
    if (!station.isActive) continue;
    if (excluded.has(station.id)) continue;
    if (options.requireBikes && station.bikesAvailable <= 0) continue;
    if (options.requireDocks && station.docksAvailable <= 0) continue;
    const distanceMeters = haversineMeters(origin, station);
    if (distanceMeters > maxDistance) continue;
    ranked.push({ station, distanceMeters });
  }

  ranked.sort((a, b) => {
    if (a.distanceMeters !== b.distanceMeters) {
      return a.distanceMeters - b.distanceMeters;
    }
    return b.station.bikesAvailable - a.station.bikesAvailable;
  });
  return ranked.slice(0, limit);
}

export function pickNearestStation(
  origin: GeoPoint,
  stations: YouBikeStation[],
  options: NearestStationOptions = {}
): RankedYouBikeStation | null {
  return rankNearbyStations(origin, stations, { ...options, limit: 1 })[0] ?? null;
}
