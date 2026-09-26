import type { GeoPoint } from "../youbike/types";
import type { MapKitRouteStep } from "../youbike/mapKitRoute";
import { stepKindFromTransport } from "./serverDirections";
import type { DirectionsMode, DirectionsRoutePlan } from "./types";

export function buildDirectionsPlan(options: {
  mode: DirectionsMode;
  origin: GeoPoint;
  destination: GeoPoint;
  destinationLabel: string;
  path: GeoPoint[];
  distanceMeters?: number;
  durationSeconds?: number;
  steps: MapKitRouteStep[];
  provider?: DirectionsRoutePlan["provider"];
}): DirectionsRoutePlan {
  const path =
    options.path.length >= 2
      ? options.path
      : [options.origin, options.destination];
  return {
    mode: options.mode,
    origin: options.origin,
    destination: options.destination,
    destinationLabel: options.destinationLabel,
    path,
    distanceMeters: options.distanceMeters ?? 0,
    durationSeconds: options.durationSeconds ?? 0,
    provider: options.provider ?? "mapkit-js",
    steps: options.steps.map((step) => ({
      kind: stepKindFromTransport(options.mode),
      instruction: step.instruction,
      streetName: step.streetName,
      distanceMeters: step.distanceMeters,
      durationSeconds: 0,
      ...(step.location ? { location: step.location } : {}),
      ...(step.path && step.path.length >= 2 ? { path: step.path } : {}),
    })),
  };
}
