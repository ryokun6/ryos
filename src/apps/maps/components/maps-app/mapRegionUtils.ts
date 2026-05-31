import type { MapKitStatus } from "../../hooks/useMapKit";
import type { MapKitCoordinate } from "./mapKitTypes";
import { MAP_MAX_SPAN_DEG, MAP_MIN_SPAN_DEG } from "./mapsUiState";

export interface MapKitRegionLike {
  center: MapKitCoordinate;
  span: { latitudeDelta: number; longitudeDelta: number };
}

export function readMapRegion(region: unknown): MapKitRegionLike | null {
  if (!region || typeof region !== "object") return null;
  const r = region as {
    center?: MapKitCoordinate;
    span?: { latitudeDelta?: number; longitudeDelta?: number };
  };
  const lat = r.span?.latitudeDelta;
  const lng = r.span?.longitudeDelta;
  if (
    !r.center ||
    typeof r.center.latitude !== "number" ||
    typeof r.center.longitude !== "number" ||
    typeof lat !== "number" ||
    typeof lng !== "number"
  ) {
    return null;
  }
  return { center: r.center, span: { latitudeDelta: lat, longitudeDelta: lng } };
}

export function clampMapSpanDegrees(degrees: number): number {
  return Math.min(MAP_MAX_SPAN_DEG, Math.max(MAP_MIN_SPAN_DEG, degrees));
}

export function statusMessageKey(status: MapKitStatus): string {
  switch (status) {
    case "missing-token":
      return "apps.maps.status.missingToken";
    case "loading":
      return "apps.maps.status.loading";
    case "error":
      return "apps.maps.status.error";
    default:
      return "apps.maps.status.idle";
  }
}
