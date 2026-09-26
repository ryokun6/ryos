import type { DirectionsMode, DirectionsStepKind } from "./types";

export const DIRECTIONS_DRIVE_STROKE = "#007aff";
export const DIRECTIONS_TRANSIT_STROKE = "#af52de";
export const DIRECTIONS_WALK_STROKE = "#007aff";

export const DIRECTIONS_DRIVE_BADGE =
  "linear-gradient(180deg, #5ac8fa 0%, color-mix(in srgb, #007aff 82%, #0040dd) 100%)";
export const DIRECTIONS_TRANSIT_BADGE =
  "linear-gradient(180deg, #bf5af2 0%, color-mix(in srgb, #af52de 82%, #8944ab) 100%)";

export function directionsStrokeColor(mode: DirectionsMode): string {
  return mode === "transit" ? DIRECTIONS_TRANSIT_STROKE : DIRECTIONS_DRIVE_STROKE;
}

export function directionsBadgeGradient(mode: DirectionsMode): string {
  return mode === "transit" ? DIRECTIONS_TRANSIT_BADGE : DIRECTIONS_DRIVE_BADGE;
}

export function directionsStepStroke(kind: DirectionsStepKind): string {
  if (kind === "transit") return DIRECTIONS_TRANSIT_STROKE;
  return DIRECTIONS_WALK_STROKE;
}
