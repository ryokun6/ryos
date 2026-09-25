import type { YouBikeCityId } from "./types";

export interface YouBikeOpenDataFeed {
  id: string;
  city: YouBikeCityId;
  /** Official municipal / DOT JSON (no API key). */
  url: string;
  /**
   * When true, a fetch failure is logged but the response still succeeds
   * if another feed returned stations.
   */
  optional?: boolean;
}

/**
 * Official YouBike 2.0 real-time JSON feeds that do not require TDX keys.
 *
 * Taipei is the verified Azure blob published by the city DOT
 * (data.gov.tw dataset 137993 / data.taipei). Other cities publish the
 * same MOTC-style or Taipei-style schema on their open-data portals; we
 * fetch them best-effort with a short timeout so a WAF or outage in one
 * city cannot blank the overlay.
 *
 * TDX (`/v2/Bike/Availability/City/{City}`) covers every YouBike city
 * but requires a registered API key — not used here.
 */
export const YOUBIKE_OPEN_DATA_FEEDS: YouBikeOpenDataFeed[] = [
  {
    id: "taipei",
    city: "taipei",
    url: "https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json",
  },
  {
    id: "newtaipei",
    city: "newtaipei",
    optional: true,
    url: "https://data.ntpc.gov.tw/api/datasets/010e5b15-fe72-4c06-be16-ea579bec4cf5/json?page=0&size=10000",
  },
  {
    id: "taoyuan",
    city: "taoyuan",
    optional: true,
    url: "https://data.tycg.gov.tw/opendata/datalist/download?rid=a1b4714b-3b75-4ff8-a8f2-cc377e4eaa0d&type=json",
  },
  {
    id: "hsinchu",
    city: "hsinchu",
    optional: true,
    url: "https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/59/05c5ab92-1d96-4428-902d-1d1c0b32bf4c.json",
  },
  {
    id: "taichung",
    city: "taichung",
    optional: true,
    url: "https://datacenter.taichung.gov.tw/swagger/OpenData/9af00e89-cff4-4c0e-af26-bb252eb11662",
  },
  {
    id: "tainan",
    city: "tainan",
    optional: true,
    url: "https://traffic.tainan.gov.tw/Publish/OpenData/youbike2.json",
  },
  {
    id: "kaohsiung",
    city: "kaohsiung",
    optional: true,
    url: "https://api.kcg.gov.tw/api/service/Get/b4dd9c40-9027-4125-8666-06bef363867c",
  },
];

export const YOUBIKE_FEED_TIMEOUT_MS = 8000;
export const YOUBIKE_CACHE_TTL_SECONDS = 60;
