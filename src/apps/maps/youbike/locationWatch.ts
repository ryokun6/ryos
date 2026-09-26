import { isValidCoordinate } from "./geo";
import type { GeoPoint } from "./types";

/** Ignore sub-meter jitter so the puck / step progress does not thrash. */
export const YOUBIKE_USER_LOCATION_DEDUP_DEG = 1e-5;

/** High-accuracy watch so iOS Safari keeps delivering GPS while riding. */
export const YOUBIKE_NAV_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 20_000,
};

export interface YouBikeUserLocationWatchFlags {
  locateMeEnabled: boolean;
  isNavigating: boolean;
}

export interface GeolocationWatchLike {
  watchPosition: (
    success: (position: {
      coords: { latitude: number; longitude: number };
    }) => void,
    error?: (error: { code?: number; message?: string }) => void,
    options?: PositionOptions
  ) => number;
  clearWatch: (watchId: number) => void;
}

export interface YouBikeUserLocationWatch {
  stop: () => void;
  /** `geolocation` when watchPosition exists; `none` if the browser cannot watch. */
  source: "geolocation" | "none";
}

/**
 * Continuous GPS is only for Locate Me + Start Navigation together.
 * Locate Me alone keeps MapKit's existing recenter / follow.
 * Navigation alone does not start a watcher.
 */
export function shouldWatchYouBikeUserLocation(
  flags: YouBikeUserLocationWatchFlags
): boolean {
  return flags.locateMeEnabled && flags.isNavigating;
}

/**
 * Locate Me button: first tap (or a tap outside navigation) enables follow.
 * A tap while already on *and* navigating turns it off so the watcher stops.
 */
export function nextLocateMeEnabled(options: {
  currentlyEnabled: boolean;
  isNavigating: boolean;
}): boolean {
  if (options.currentlyEnabled && options.isNavigating) return false;
  return true;
}

export function isDistinctUserLocation(
  previous: GeoPoint | null,
  next: GeoPoint,
  epsilonDeg = YOUBIKE_USER_LOCATION_DEDUP_DEG
): boolean {
  if (!isValidCoordinate(next)) return false;
  if (!previous || !isValidCoordinate(previous)) return true;
  return (
    Math.abs(next.latitude - previous.latitude) >= epsilonDeg ||
    Math.abs(next.longitude - previous.longitude) >= epsilonDeg
  );
}

export function geoPointFromCoords(
  coords:
    | {
        latitude?: unknown;
        longitude?: unknown;
      }
    | null
    | undefined
): GeoPoint | null {
  if (!coords) return null;
  const point = {
    latitude: Number(coords.latitude),
    longitude: Number(coords.longitude),
  };
  return isValidCoordinate(point) ? point : null;
}

/** MapKit `user-location-change` carries the fix on the event, not only `map.userLocation`. */
export function coordinateFromUserLocationEvent(event: unknown): GeoPoint | null {
  if (!event || typeof event !== "object") return null;
  const coordinate = (event as { coordinate?: { latitude?: unknown; longitude?: unknown } })
    .coordinate;
  if (!coordinate) return null;
  return geoPointFromCoords(coordinate);
}

export function createYouBikeUserPuckElement(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-youbike-user-puck", "true");
  el.setAttribute("aria-hidden", "true");
  el.style.width = "16px";
  el.style.height = "16px";
  el.style.borderRadius = "50%";
  el.style.background = "#007aff";
  el.style.border = "2.5px solid #fff";
  el.style.boxShadow =
    "0 0 0 1px rgba(0, 122, 255, 0.28), 0 1px 3px rgba(0, 0, 0, 0.35)";
  el.style.pointerEvents = "none";
  return el;
}

/**
 * Own the Geolocation watch so navigation is not stuck on MapKit's first fix.
 * `watchPosition` can be missing on some older MapKit JS / WebKit builds.
 */
export function startYouBikeUserLocationWatch(options: {
  geolocation?: GeolocationWatchLike | null;
  onUpdate: (point: GeoPoint) => void;
  onError?: (error: { code?: number; message?: string }) => void;
  watchOptions?: PositionOptions;
}): YouBikeUserLocationWatch {
  const geo = options.geolocation;
  if (!geo || typeof geo.watchPosition !== "function") {
    return { source: "none", stop() {} };
  }

  let stopped = false;
  const watchId = geo.watchPosition(
    (position) => {
      if (stopped) return;
      const point = geoPointFromCoords(position.coords);
      if (!point) return;
      options.onUpdate(point);
    },
    (error) => {
      if (stopped) return;
      options.onError?.(error);
    },
    options.watchOptions ?? YOUBIKE_NAV_WATCH_OPTIONS
  );

  return {
    source: "geolocation",
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        geo.clearWatch(watchId);
      } catch {
        // ignore
      }
    },
  };
}
