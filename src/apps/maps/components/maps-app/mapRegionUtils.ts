import type { MapKitStatus } from "../../hooks/useMapKit";
import type { MapKitCoordinate } from "./mapKitTypes";
import {
  CITY_LEVEL_SPAN_DEG,
  DEFAULT_MAP_CENTER,
  LOCATE_ME_SPAN_DEG,
  MAP_MAX_SPAN_DEG,
  MAP_MIN_SPAN_DEG,
} from "./mapsUiState";

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

export function squareMapRegion(
  center: MapKitCoordinate,
  spanDeg: number
): MapKitRegionLike {
  return {
    center,
    span: { latitudeDelta: spanDeg, longitudeDelta: spanDeg },
  };
}

/** Street / neighborhood camera used when Locate Me turns on or Maps opens on Home. */
export function locateMeFocusRegion(center: MapKitCoordinate): MapKitRegionLike {
  return squareMapRegion(center, LOCATE_ME_SPAN_DEG);
}

export function initialHomeMapRegion(home: MapKitCoordinate): MapKitRegionLike {
  return locateMeFocusRegion(home);
}

export type InitialMapFrameTarget = "home" | "grantedLocation" | "defaultTaipei";

/** Home starts close; granted GPS / Taipei default stay city-wide. */
export function initialMapFrameSpanDeg(target: InitialMapFrameTarget): number {
  return target === "home" ? LOCATE_ME_SPAN_DEG : CITY_LEVEL_SPAN_DEG;
}

export function defaultTaipeiMapRegion(): MapKitRegionLike {
  return squareMapRegion(DEFAULT_MAP_CENTER, CITY_LEVEL_SPAN_DEG);
}

export type LocateMeCameraMode = "focus" | "recenter" | "idle";

/**
 * First Locate Me fix zooms to neighborhood span; later GPS ticks only
 * recenter so the rider can still pinch / zoom while tracking.
 */
export function locateMeCameraMode(options: {
  locateMeEnabled: boolean;
  hasAppliedFocusZoom: boolean;
}): LocateMeCameraMode {
  if (!options.locateMeEnabled) return "idle";
  return options.hasAppliedFocusZoom ? "recenter" : "focus";
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
