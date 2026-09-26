import { TAIWAN_BBOX, bboxIntersects } from "./geo";
import type { GeoBBox, YouBikeCityId } from "./types";

export interface YouBikeOpenDataFeed {
  id: string;
  city: YouBikeCityId;
  /** Official YouBike JSON (no API key). */
  url: string;
  /** Coverage used to skip the feed when the viewport is outside Taiwan. */
  bbox: GeoBBox;
  /** Override the default fetch timeout for this feed. */
  timeoutMs?: number;
  /** Override the default Redis TTL for a successful cache write. */
  cacheTtlSeconds?: number;
}

/**
 * Official YouBike 2.0 real-time JSON. The national dump is the same
 * `station-yb2.json` file the YouBike app loads — one source for every
 * city, including Taichung. Municipal open-data portals (Taichung DOT,
 * New Taipei, Taoyuan, Hsinchu, Tainan, Kaohsiung) are dead or non-JSON.
 *
 * TDX (`/v2/Bike/Availability/City/{City}`) requires a registered API
 * key and is not used here.
 */
export const YOUBIKE_OPEN_DATA_FEEDS: YouBikeOpenDataFeed[] = [
  {
    id: "national",
    city: "unknown",
    bbox: TAIWAN_BBOX,
    url: "https://apis.youbike.com.tw/json/station-yb2.json",
    timeoutMs: 20_000,
    cacheTtlSeconds: 120,
  },
];

export const YOUBIKE_FEED_TIMEOUT_MS = 20_000;
export const YOUBIKE_CACHE_TTL_SECONDS = 120;

export function feedTimeoutMs(
  feed: YouBikeOpenDataFeed,
  fallbackMs: number
): number {
  return feed.timeoutMs ?? fallbackMs;
}

export function feedCacheTtlSeconds(feed: YouBikeOpenDataFeed): number {
  return feed.cacheTtlSeconds ?? YOUBIKE_CACHE_TTL_SECONDS;
}

export function feedsIntersectingBBox(
  bbox: GeoBBox | null,
  feeds: YouBikeOpenDataFeed[] = YOUBIKE_OPEN_DATA_FEEDS
): YouBikeOpenDataFeed[] {
  if (!bbox) return feeds;
  return feeds.filter((feed) => bboxIntersects(bbox, feed.bbox));
}

export function youbikeFeedCacheKey(feedId: string): string {
  return `cache:youbike:stations:v5:${feedId}`;
}
