/**
 * Normalized YouBike 2.0 station + trip types shared by the API parser
 * and the Maps overlay / directions planner.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GeoBBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type YouBikeCityId =
  | "taipei"
  | "newtaipei"
  | "taoyuan"
  | "hsinchu"
  | "hsinchuCounty"
  | "miaoli"
  | "taichung"
  | "chiayi"
  | "tainan"
  | "kaohsiung"
  | "pingtung"
  | "taitung"
  | "unknown";

export interface YouBikeStation {
  id: string;
  stationId: string;
  city: YouBikeCityId;
  name: string;
  nameEn: string;
  address: string;
  addressEn: string;
  area: string;
  areaEn: string;
  latitude: number;
  longitude: number;
  bikesAvailable: number;
  docksAvailable: number;
  totalDocks: number;
  isActive: boolean;
  updatedAt: string | null;
  source: string;
}

export interface YouBikeStationsResponse {
  stations: YouBikeStation[];
  fetchedAt: number;
  cacheHit: boolean;
  sources: YouBikeFeedStatus[];
}

export interface YouBikeFeedStatus {
  id: string;
  city: YouBikeCityId;
  ok: boolean;
  count: number;
  error?: string;
}

export type YouBikeLegMode = "walk" | "bike";

/** Structured OSRM maneuver. MapKit steps omit this and keep Apple's instruction. */
export interface YouBikeStepManeuver {
  type: string;
  modifier: string;
}

/** How a generic “arrive at the destination” step should read on a multi-leg trip. */
export type YouBikeArrivalRole = "pickup" | "dock" | "place";

export interface YouBikeRouteStep {
  mode: YouBikeLegMode;
  /** Maneuver, e.g. "Turn right". MapKit may already include the street. */
  instruction: string;
  streetName: string;
  distanceMeters: number;
  durationSeconds: number;
  /** Where the maneuver happens, when the router provided one. */
  location?: GeoPoint;
  /** Road geometry for this step, when the router provided it. */
  path?: GeoPoint[];
  maneuver?: YouBikeStepManeuver;
  /** Set when this step is a generic arrival that should use YouBike copy. */
  arrivalRole?: YouBikeArrivalRole;
  /** Place name for `arrivalRole: "place"` (the trip destination). */
  arrivalPlace?: string;
}

export interface YouBikeRouteLeg {
  mode: YouBikeLegMode;
  from: GeoPoint;
  to: GeoPoint;
  fromLabel: string;
  toLabel: string;
  distanceMeters: number;
  durationSeconds: number;
  /** Optional road-following path (walk legs from MapKit). */
  path?: GeoPoint[];
  /** Turn-by-turn maneuvers. Hidden in the route card until requested. */
  steps?: YouBikeRouteStep[];
}

export type YouBikeRouteKind = "youbike" | "walk";

export interface YouBikeRoutePlan {
  kind: YouBikeRouteKind;
  origin: GeoPoint;
  destination: GeoPoint;
  originStation: YouBikeStation | null;
  destinationStation: YouBikeStation | null;
  legs: YouBikeRouteLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  warnings: string[];
}

export interface YouBikePlaceExtras {
  stationId: string;
  city: YouBikeCityId;
  bikesAvailable: number;
  docksAvailable: number;
  totalDocks: number;
  isActive: boolean;
  updatedAt?: string | null;
}
