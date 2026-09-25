import { bboxIntersects } from "./geo";
import type { GeoBBox, YouBikeCityId } from "./types";

export interface YouBikeOpenDataFeed {
  id: string;
  city: YouBikeCityId;
  /** Official municipal / DOT JSON (no API key). */
  url: string;
  /** City coverage used to skip feeds outside the current viewport. */
  bbox: GeoBBox;
  /**
   * When true, a fetch failure is logged but the response still succeeds
   * if another feed returned stations. Optional feeds never block a
   * required-feed response.
   */
  optional?: boolean;
}

/**
 * Official YouBike 2.0 real-time JSON feeds that do not require TDX keys.
 *
 * Taipei is the verified Azure blob published by the city DOT
 * (data.gov.tw dataset 137993 / data.taipei). Other cities publish the
 * same MOTC-style or Taipei-style schema on their open-data portals; we
 * fetch them only when the viewport intersects that city, and never wait
 * on them when Taipei (or another required feed) already answered.
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
    id: "newtaipei",
    city: "newtaipei",
    optional: true,
    bbox: { south: 24.86, west: 121.28, north: 25.3, east: 122.02 },
    url: "https://data.ntpc.gov.tw/api/datasets/010e5b15-fe72-4c06-be16-ea579bec4cf5/json?page=0&size=10000",
  },
  {
    id: "taoyuan",
    city: "taoyuan",
    optional: true,
    bbox: { south: 24.85, west: 121.08, north: 25.13, east: 121.4 },
    url: "https://data.tycg.gov.tw/opendata/datalist/download?rid=a1b4714b-3b75-4ff8-a8f2-cc377e4eaa0d&type=json",
  },
  {
    id: "hsinchu",
    city: "hsinchu",
    optional: true,
    bbox: { south: 24.76, west: 120.9, north: 24.86, east: 121.04 },
    url: "https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/59/05c5ab92-1d96-4428-902d-1d1c0b32bf4c.json",
  },
  {
    id: "taichung",
    city: "taichung",
    optional: true,
    bbox: { south: 24.05, west: 120.48, north: 24.32, east: 120.82 },
    url: "https://datacenter.taichung.gov.tw/swagger/OpenData/9af00e89-cff4-4c0e-af26-bb252eb11662",
  },
  {
    id: "tainan",
    city: "tainan",
    optional: true,
    bbox: { south: 22.92, west: 120.1, north: 23.12, east: 120.36 },
    url: "https://traffic.tainan.gov.tw/Publish/OpenData/youbike2.json",
  },
  {
    id: "kaohsiung",
    city: "kaohsiung",
    optional: true,
    bbox: { south: 22.52, west: 120.23, north: 22.78, east: 120.45 },
    url: "https://api.kcg.gov.tw/api/service/Get/b4dd9c40-9027-4125-8666-06bef363867c",
  },
];

export const YOUBIKE_FEED_TIMEOUT_MS = 6000;
export const YOUBIKE_OPTIONAL_FEED_TIMEOUT_MS = 2000;
export const YOUBIKE_CACHE_TTL_SECONDS = 60;

export function feedsIntersectingBBox(
  bbox: GeoBBox | null,
  feeds: YouBikeOpenDataFeed[] = YOUBIKE_OPEN_DATA_FEEDS
): YouBikeOpenDataFeed[] {
  if (!bbox) {
    return feeds.filter((feed) => !feed.optional);
  }
  return feeds.filter((feed) => bboxIntersects(bbox, feed.bbox));
}

export function youbikeFeedCacheKey(feedId: string): string {
  return `cache:youbike:stations:v2:${feedId}`;
}
