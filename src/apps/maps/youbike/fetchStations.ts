import { padBBox } from "./geo";
import type { GeoBBox, YouBikeStation, YouBikeStationsResponse } from "./types";

const CLIENT_CACHE_TTL_MS = 45_000;

interface CachedStations {
  fetchedAt: number;
  bbox: GeoBBox;
  stations: YouBikeStation[];
}

let memoryCache: CachedStations | null = null;

export function bboxToQuery(bbox: GeoBBox): string {
  const params = new URLSearchParams({
    south: String(bbox.south),
    west: String(bbox.west),
    north: String(bbox.north),
    east: String(bbox.east),
  });
  return params.toString();
}

export async function fetchYouBikeStations(
  bbox: GeoBBox,
  options?: { signal?: AbortSignal }
): Promise<YouBikeStation[]> {
  const padded = padBBox(bbox, 0.25);
  if (
    memoryCache &&
    Date.now() - memoryCache.fetchedAt < CLIENT_CACHE_TTL_MS &&
    padded.south >= memoryCache.bbox.south &&
    padded.north <= memoryCache.bbox.north &&
    padded.west >= memoryCache.bbox.west &&
    padded.east <= memoryCache.bbox.east
  ) {
    return memoryCache.stations.filter(
      (station) =>
        station.latitude >= padded.south &&
        station.latitude <= padded.north &&
        station.longitude >= padded.west &&
        station.longitude <= padded.east
    );
  }

  const response = await fetch(`/api/youbike/stations?${bboxToQuery(padded)}`, {
    signal: options?.signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`YouBike stations request failed (${response.status})`);
  }
  const data = (await response.json()) as YouBikeStationsResponse;
  const stations = Array.isArray(data.stations) ? data.stations : [];
  memoryCache = { fetchedAt: Date.now(), bbox: padded, stations };
  return stations;
}

export function clearYouBikeStationsCache(): void {
  memoryCache = null;
}
