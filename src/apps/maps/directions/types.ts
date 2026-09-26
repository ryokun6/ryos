import type { GeoPoint } from "../youbike/types";

export type DirectionsMode = "drive" | "transit";

export type DirectionsStepKind = "drive" | "transit" | "walk";

export interface DirectionsRouteStep {
  kind: DirectionsStepKind;
  instruction: string;
  streetName: string;
  distanceMeters: number;
  durationSeconds: number;
  location?: GeoPoint;
  path?: GeoPoint[];
}

export interface DirectionsRoutePlan {
  mode: DirectionsMode;
  origin: GeoPoint;
  destination: GeoPoint;
  destinationLabel: string;
  path: GeoPoint[];
  distanceMeters: number;
  durationSeconds: number;
  steps: DirectionsRouteStep[];
  provider: "mapkit-js" | "maps-server";
}

export type DirectionsRouteError = "no_origin" | "route_failed" | "transit_unavailable";
