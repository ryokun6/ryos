import { TAIWAN_BBOX, bboxContains, bboxIntersects } from "./geo";
import type { GeoBBox, YouBikeCityId } from "./types";

export interface YouBikeOpenDataFeed {
  id: string;
  city: YouBikeCityId;
  /** Official municipal / DOT / YouBike JSON (no API key). */
  url: string;
  /** City coverage used to skip feeds outside the current viewport. */
  bbox: GeoBBox;
  /**
   * When true, a fetch failure is logged but the response still succeeds
   * if another feed returned stations. Optional feeds never block a
   * required-feed response that already covers the viewport.
   */
  optional?: boolean;
  /** Override the default fetch timeout for this feed. */
  timeoutMs?: number;
  /** Override the default Redis TTL for a successful cache write. */
  cacheTtlSeconds?: number;
}

/**
 * Official YouBike 2.0 real-time JSON feeds that do not require TDX keys.
 *
 * Taipei is the verified Azure blob published by the city DOT
 * (data.gov.tw dataset 137993 / data.taipei). Other municipal portals
 * (Taichung, New Taipei, Taoyuan, Hsinchu, Tainan, Kaohsiung) are dead
 * or return non-JSON, so non-Taipei coverage comes from YouBike's
 * national 2.0 dump. That dump is ~6MB and is fetched only when the
 * viewport needs stations outside Taipei.
 *
 * TDX (`/v2/Bike/Availability/City/{City}`) covers every YouBike city
 * but requires a registered API key — not used here.
 */
export const YOUBIKE_OPEN_DATA_FEEDS: YouBikeOpenDataFeed[] = [
  {
    id: "taipei",
    city: "taipei",
    bbox: { south: 24.96, west: 121.45, north: 25.21, east: 121.67 },
    url: "https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json",
  },
  {
    id: "national",
    city: "unknown",
    optional: true,
    bbox: TAIWAN_BBOX,
    url: "https://apis.youbike.com.tw/json/station-yb2.json",
    timeoutMs: 12_000,
    cacheTtlSeconds: 120,
  },
];

export const YOUBIKE_FEED_TIMEOUT_MS = 6000;
export const YOUBIKE_OPTIONAL_FEED_TIMEOUT_MS = 8000;
export const YOUBIKE_CACHE_TTL_SECONDS = 60;

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
  if (!bbox) {
    return feeds.filter((feed) => !feed.optional);
  }
  return feeds.filter((feed) => bboxIntersects(bbox, feed.bbox));
}

/**
 * Wait for optional feeds when they are the only source, or when the
 * viewport sticks out of every required city bbox (e.g. New Taipei /
 * Taichung). A Taipei-only camera can answer from the DOT blob alone.
 */
export function shouldWaitForOptionalFeeds(
  bbox: GeoBBox | null,
  required: YouBikeOpenDataFeed[],
  optional: YouBikeOpenDataFeed[]
): boolean {
  if (optional.length === 0) return false;
  if (required.length === 0) return true;
  if (!bbox) return false;
  return !required.some((feed) => bboxContains(feed.bbox, bbox));
}

export function youbikeFeedCacheKey(feedId: string): string {
  return `cache:youbike:stations:v3:${feedId}`;
}
