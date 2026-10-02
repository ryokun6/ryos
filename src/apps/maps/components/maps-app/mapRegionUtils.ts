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

/** Wider axis of the visible region; null when the map has no readable span. */
export function visibleMapSpanDeg(region: MapKitRegionLike | null): number | null {
  if (!region) return null;
  const span = Math.max(region.span.latitudeDelta, region.span.longitudeDelta);
  return Number.isFinite(span) ? span : null;
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

export type InitialMapFrameTarget =
  | "home"
  | "grantedLocation"
  | "geoip"
  | "defaultTaipei";

/**
 * Home starts close. Granted GPS, GeoIP city, and Taipei fallback stay
 * city-wide so YouBike / metro overview is unchanged.
 */
export function initialMapFrameSpanDeg(target: InitialMapFrameTarget): number {
  return target === "home" ? LOCATE_ME_SPAN_DEG : CITY_LEVEL_SPAN_DEG;
}

/** Last-resort city-wide camera when GeoIP has no usable point. */
export function defaultTaipeiMapRegion(): MapKitRegionLike {
  return squareMapRegion(DEFAULT_MAP_CENTER, CITY_LEVEL_SPAN_DEG);
}

export function geoIpCityMapRegion(center: MapKitCoordinate): MapKitRegionLike {
  return squareMapRegion(center, CITY_LEVEL_SPAN_DEG);
}

export type LocateMeCameraMode = "focus" | "recenter" | "idle";

/**
 * First Locate Me fix zooms in to the neighborhood span only when the
 * current view is wider. If the user is already closer, just recenter.
 * Later GPS ticks only recenter so pinch-zoom while tracking is kept.
 * Locate Me off is always idle — do not zoom out or reset the region.
 * Paused follow (user panned away) is idle too until a Locate Me tap resumes it.
 */
export function locateMeCameraMode(options: {
  locateMeEnabled: boolean;
  hasAppliedFocusZoom: boolean;
  currentSpanDeg?: number | null;
  followPaused?: boolean;
}): LocateMeCameraMode {
  if (!options.locateMeEnabled || options.followPaused) return "idle";
  if (options.hasAppliedFocusZoom) return "recenter";
  const span = options.currentSpanDeg;
  if (typeof span === "number" && Number.isFinite(span) && span <= LOCATE_ME_SPAN_DEG) {
    return "recenter";
  }
  return "focus";
}

/** Share of the visible span the user may sit off-center before a zoom counts as moving away. */
export const LOCATE_ME_FOLLOW_CENTER_TOLERANCE = 0.25;

/**
 * After a user zoom (pinch, double-tap, wheel), keep following only when the
 * user is still near the middle of the view. Zooms anchored far from the
 * user move the camera away and pause follow like a pan does.
 */
export function isPointNearMapCenter(
  region: MapKitRegionLike | null,
  point: MapKitCoordinate,
  tolerance = LOCATE_ME_FOLLOW_CENTER_TOLERANCE
): boolean {
  if (!region) return true;
  const { center, span } = region;
  const latOffset = Math.abs(point.latitude - center.latitude);
  let lngOffset = Math.abs(point.longitude - center.longitude);
  if (lngOffset > 180) lngOffset = 360 - lngOffset;
  return (
    latOffset <= span.latitudeDelta * tolerance &&
    lngOffset <= span.longitudeDelta * tolerance
  );
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
