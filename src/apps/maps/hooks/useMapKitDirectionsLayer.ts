import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { SavedPlace } from "../utils/types";
import {
  isValidCoordinate,
  regionFittingPoints,
  type FittedMapRegion,
  type GeoPoint,
} from "../youbike";
import { youbikeNextStepIndex, youbikeStepFocusRegion } from "../youbike/routeSteps";
import {
  extractMapKitRouteMetrics,
  extractMapKitRoutePath,
  extractMapKitRouteSteps,
  resolveMapKitTransport,
} from "../youbike/mapKitRoute";
import {
  buildDirectionsPlan,
  directionsStrokeColor,
  fetchServerDirections,
  pickDirectionsOrigin,
  type DirectionsMode,
  type DirectionsRouteError,
  type DirectionsRoutePlan,
} from "../directions";
import {
  getMapKit,
  type MapKitCoordinate,
  type MapKitDirectionsInstance,
  type MapKitMapInstance,
} from "../components/maps-app/mapKitTypes";
import { readMapRegion } from "../components/maps-app/mapRegionUtils";

const USER_LOCATION_POLL_MS = 2000;
const USER_LOCATION_DEDUP_DEG = 1e-5;
const MAPKIT_ROUTE_TIMEOUT_MS = 10_000;

export interface UseMapKitDirectionsLayerArgs {
  mapReadyTick: number;
  mapInstanceRef: MutableRefObject<MapKitMapInstance | null>;
  homePlace: SavedPlace | null;
  workPlace: SavedPlace | null;
}

function toMapKitCoordinate(
  mk: NonNullable<ReturnType<typeof getMapKit>>,
  point: GeoPoint
): MapKitCoordinate {
  return new mk.Coordinate(point.latitude, point.longitude);
}

function animateMapToRegion(
  mk: NonNullable<ReturnType<typeof getMapKit>>,
  map: MapKitMapInstance,
  fitted: FittedMapRegion
): void {
  const center = new mk.Coordinate(fitted.center.latitude, fitted.center.longitude);
  const span = new mk.CoordinateSpan(fitted.latitudeDelta, fitted.longitudeDelta);
  map.setRegionAnimated(new mk.CoordinateRegion(center, span), true);
}

function mapKitKind(mode: DirectionsMode): "Automobile" | "Transit" {
  return mode === "transit" ? "Transit" : "Automobile";
}

function requestMapKitDirections(
  mk: NonNullable<ReturnType<typeof getMapKit>>,
  from: GeoPoint,
  to: GeoPoint,
  mode: DirectionsMode
): Promise<ReturnType<typeof buildDirectionsPlan> | null> {
  return new Promise((resolve) => {
    if (!mk.Directions) {
      resolve(null);
      return;
    }
    const transport = resolveMapKitTransport(mk.Directions, mapKitKind(mode));
    if (!transport) {
      resolve(null);
      return;
    }
    const directions = new mk.Directions() as MapKitDirectionsInstance;
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, MAPKIT_ROUTE_TIMEOUT_MS);
    try {
      directions.route(
        {
          origin: toMapKitCoordinate(mk, from),
          destination: toMapKitCoordinate(mk, to),
          transportType: transport,
        },
        (error, data) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          const route = data?.routes?.[0];
          const path = extractMapKitRoutePath(route);
          if (error || path.length < 2) {
            resolve(null);
            return;
          }
          const metrics = extractMapKitRouteMetrics(route);
          resolve(
            buildDirectionsPlan({
              mode,
              origin: from,
              destination: to,
              destinationLabel: "",
              path,
              distanceMeters: metrics.distanceMeters,
              durationSeconds: metrics.durationSeconds,
              steps: extractMapKitRouteSteps(route),
              provider: "mapkit-js",
            })
          );
        }
      );
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

function readBrowserLocation(): Promise<GeoPoint | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        resolve(isValidCoordinate(point) ? point : null);
      },
      () => resolve(null),
      { timeout: 4000, maximumAge: 5 * 60 * 1000 }
    );
  });
}

export function useMapKitDirectionsLayer({
  mapReadyTick,
  mapInstanceRef,
  homePlace,
  workPlace,
}: UseMapKitDirectionsLayerArgs) {
  const [routePlan, setRoutePlan] = useState<DirectionsRoutePlan | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState<DirectionsRouteError | null>(null);
  const [destinationPlace, setDestinationPlace] = useState<SavedPlace | null>(null);
  const [activeMode, setActiveMode] = useState<DirectionsMode | null>(null);
  const [locationTracking, setLocationTracking] = useState(false);
  const [trackedUser, setTrackedUser] = useState<GeoPoint | null>(null);
  const overlaysRef = useRef<unknown[]>([]);
  const routeRequestIdRef = useRef(0);

  const clearRouteOverlays = useCallback(() => {
    const map = mapInstanceRef.current;
    if (map?.removeOverlays && overlaysRef.current.length > 0) {
      try {
        map.removeOverlays(overlaysRef.current);
      } catch {
        for (const overlay of overlaysRef.current) {
          try {
            map.removeOverlay?.(overlay);
          } catch {
            // ignore
          }
        }
      }
    }
    overlaysRef.current = [];
  }, [mapInstanceRef]);

  useEffect(() => {
    return () => {
      clearRouteOverlays();
    };
  }, [clearRouteOverlays]);

  const drawRouteOverlays = useCallback(
    (plan: DirectionsRoutePlan) => {
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (!mk || !map || !mk.PolylineOverlay) return;
      clearRouteOverlays();
      const path = (plan.path.length >= 2
        ? plan.path
        : [plan.origin, plan.destination]
      ).map((point) => toMapKitCoordinate(mk, point));
      const style = mk.Style
        ? new mk.Style({
            lineWidth: 5,
            strokeColor: directionsStrokeColor(plan.mode),
            lineCap: "round",
            lineJoin: "round",
          })
        : undefined;
      try {
        const overlay = new mk.PolylineOverlay(path, style ? { style } : undefined);
        if (map.addOverlays) {
          map.addOverlays([overlay]);
        } else {
          map.addOverlay?.(overlay);
        }
        overlaysRef.current = [overlay];
        const fitted = regionFittingPoints(plan.path.length >= 2 ? plan.path : path);
        if (fitted) animateMapToRegion(mk, map, fitted);
      } catch {
        // ignore
      }
    },
    [clearRouteOverlays, mapInstanceRef]
  );

  const resolveOrigin = useCallback(
    async (destination: GeoPoint): Promise<GeoPoint | { error: "no_origin" }> => {
      const map = mapInstanceRef.current;
      const user = map?.userLocation?.coordinate;
      const userLocation =
        user && isValidCoordinate({ latitude: user.latitude, longitude: user.longitude })
          ? { latitude: user.latitude, longitude: user.longitude }
          : null;
      const geoLocation = userLocation ? null : await readBrowserLocation();
      const region = map ? readMapRegion(map.region) : null;
      return pickDirectionsOrigin({
        userLocation,
        geoLocation,
        home: homePlace,
        work: workPlace,
        mapCenter: region
          ? { latitude: region.center.latitude, longitude: region.center.longitude }
          : null,
        destination,
      });
    },
    [homePlace, mapInstanceRef, workPlace]
  );

  const handleDirections = useCallback(
    async (destination: SavedPlace, mode: DirectionsMode) => {
      const destPoint: GeoPoint = {
        latitude: destination.latitude,
        longitude: destination.longitude,
      };
      setIsRouting(true);
      setRouteError(null);
      setDestinationPlace(destination);
      setActiveMode(mode);
      const requestId = ++routeRequestIdRef.current;
      try {
        const originOrError = await resolveOrigin(destPoint);
        if ("error" in originOrError) {
          setRouteError(originOrError.error);
          setRoutePlan(null);
          return;
        }

        const mk = getMapKit();
        let plan = mk
          ? await requestMapKitDirections(mk, originOrError, destPoint, mode)
          : null;
        if (plan) {
          plan = { ...plan, destinationLabel: destination.name };
        } else {
          plan = await fetchServerDirections({
            from: originOrError,
            to: destPoint,
            mode,
            destinationLabel: destination.name,
          });
        }
        if (requestId !== routeRequestIdRef.current) return;
        if (!plan) {
          setRouteError(mode === "transit" ? "transit_unavailable" : "route_failed");
          setRoutePlan(null);
          return;
        }
        setRoutePlan(plan);
        drawRouteOverlays(plan);
      } catch {
        if (requestId !== routeRequestIdRef.current) return;
        setRouteError(mode === "transit" ? "transit_unavailable" : "route_failed");
        setRoutePlan(null);
      } finally {
        if (requestId === routeRequestIdRef.current) {
          setIsRouting(false);
        }
      }
    },
    [drawRouteOverlays, resolveOrigin]
  );

  const focusStep = useCallback(
    (step: DirectionsRoutePlan["steps"][number]) => {
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (!mk || !map) return;
      const fitted = youbikeStepFocusRegion(step);
      if (!fitted) return;
      try {
        animateMapToRegion(mk, map, fitted);
      } catch {
        // ignore
      }
    },
    [mapInstanceRef]
  );

  const handleClearRoute = useCallback(() => {
    routeRequestIdRef.current += 1;
    setRoutePlan(null);
    setRouteError(null);
    setIsRouting(false);
    setDestinationPlace(null);
    setActiveMode(null);
    clearRouteOverlays();
  }, [clearRouteOverlays]);

  useEffect(() => {
    if (!routePlan || mapReadyTick === 0) {
      setLocationTracking(false);
      setTrackedUser(null);
      return;
    }
    const map = mapInstanceRef.current;
    if (!map) {
      setLocationTracking(false);
      setTrackedUser(null);
      return;
    }

    let lastLat = Number.NaN;
    let lastLng = Number.NaN;
    const readUserLocation = () => {
      const tracking = map.showsUserLocation || map.tracksUserLocation;
      setLocationTracking(tracking);
      if (!tracking) {
        lastLat = Number.NaN;
        lastLng = Number.NaN;
        setTrackedUser(null);
        return;
      }
      const coordinate = map.userLocation?.coordinate;
      if (
        !coordinate ||
        !isValidCoordinate({
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
        })
      ) {
        setTrackedUser(null);
        return;
      }
      if (
        Math.abs(coordinate.latitude - lastLat) < USER_LOCATION_DEDUP_DEG &&
        Math.abs(coordinate.longitude - lastLng) < USER_LOCATION_DEDUP_DEG
      ) {
        return;
      }
      lastLat = coordinate.latitude;
      lastLng = coordinate.longitude;
      setTrackedUser({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      });
    };

    readUserLocation();
    map.addEventListener?.("user-location-change", readUserLocation);
    const timer = window.setInterval(readUserLocation, USER_LOCATION_POLL_MS);
    return () => {
      map.removeEventListener?.("user-location-change", readUserLocation);
      window.clearInterval(timer);
    };
  }, [mapInstanceRef, mapReadyTick, routePlan]);

  const activeStepIndex = useMemo(() => {
    if (!locationTracking || !trackedUser || !routePlan) return null;
    return youbikeNextStepIndex(routePlan.steps, trackedUser);
  }, [locationTracking, routePlan, trackedUser]);

  return {
    routePlan,
    isRouting,
    routeError,
    handleDirections,
    handleClearRoute,
    focusStep,
    activeStepIndex,
    trackedUser,
    pendingMode: activeMode ?? routePlan?.mode ?? null,
    destinationPlace,
  };
}
