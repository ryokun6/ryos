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
  RYOS_MAP_YOUBIKE_CLUSTER_ID,
  clusteringIdentifierForRegion,
} from "../utils/mapMarkerClustering";
import {
  bboxIntersectsTaiwan,
  filterStationsInBBox,
  isInTaiwan,
  padBBox,
  regionFittingPoints,
  type FittedMapRegion,
  type GeoBBox,
  type GeoPoint,
  type YouBikeLegMode,
  type YouBikeRoutePlan,
  type YouBikeRouteStep,
  type YouBikeStation,
} from "../youbike";
import { fetchYouBikeStations } from "../youbike/fetchStations";
import { mergeYouBikeStations } from "../youbike/parseStations";
import { isYouBikePlace, youbikeStationToSavedPlace } from "../youbike/place";
import { isYouBikeRouteError, planYouBikeTrip } from "../youbike/routePlan";
import {
  YOUBIKE_BIKE_STROKE,
  YOUBIKE_WALK_STROKE,
  applyYouBikeDotAppearance,
  createYouBikeDotElement,
  shouldRenderYouBikeOverlayForSpan,
  youbikeDotFramePx,
  youbikeMapScheme,
  youbikePinTitle,
  youbikeShouldPaintDot,
  youbikeStationMarkerColor,
  type YouBikeDotEmphasis,
  type YouBikeMapScheme,
} from "../youbike/stationVisuals";
import { fetchYouBikeBikeRoute } from "../youbike/fetchBikeRoute";
import {
  listYouBikeRouteSteps,
  youbikeNextStepIndex,
  youbikeStepFocusRegion,
} from "../youbike/routeSteps";
import { cancelYouBikeNavigationSpeech } from "../youbike/navigationSpeech";
import {
  coordinateFromUserLocationEvent,
  createYouBikeUserPuckElement,
  geoPointFromCoords,
  isDistinctUserLocation,
  shouldWatchYouBikeUserLocation,
  startYouBikeUserLocationWatch,
} from "../youbike/locationWatch";
import {
  extractMapKitRouteMetrics,
  extractMapKitRoutePath,
  extractMapKitRouteSteps,
  resolveMapKitTransport,
  type MapKitTransportKind,
} from "../youbike/mapKitRoute";
import {
  getMapKit,
  type MapKitCoordinate,
  type MapKitDirectionsInstance,
  type MapKitMapInstance,
  type MapKitMarkerAnnotation,
} from "../components/maps-app/mapKitTypes";
import { readMapRegion } from "../components/maps-app/mapRegionUtils";

const REGION_FETCH_DEBOUNCE_MS = 280;
/** Extra margin so a short pan does not flash empty then refill. */
const RENDER_PAD_FACTOR = 0.1;

export interface UseYouBikeLayerArgs {
  enabled: boolean;
  mapReadyTick: number;
  mapInstanceRef: MutableRefObject<MapKitMapInstance | null>;
  language: string | undefined;
  homePlace: SavedPlace | null;
  workPlace: SavedPlace | null;
  selectedPlace: SavedPlace | null;
  setSelectedPlace: (place: SavedPlace | null) => void;
  recordRecentPlace: (place: SavedPlace) => void;
  savedPlaceIds: Set<string>;
  isDarkMode: boolean;
  /** Toolbar / menu Locate Me is on — starts a continuous GPS watch. */
  locateMeEnabled: boolean;
}

function regionToBBox(region: ReturnType<typeof readMapRegion>): GeoBBox | null {
  if (!region) return null;
  const latPad = region.span.latitudeDelta / 2;
  const lngPad = region.span.longitudeDelta / 2;
  return {
    south: region.center.latitude - latPad,
    north: region.center.latitude + latPad,
    west: region.center.longitude - lngPad,
    east: region.center.longitude + lngPad,
  };
}

function toMapKitCoordinate(
  mk: NonNullable<ReturnType<typeof getMapKit>>,
  point: GeoPoint
): MapKitCoordinate {
  return new mk.Coordinate(point.latitude, point.longitude);
}

function featureVisibility(
  mk: NonNullable<ReturnType<typeof getMapKit>>,
  kind: "hidden" | "visible"
): string {
  if (kind === "visible") return mk.FeatureVisibility?.Visible ?? "visible";
  return mk.FeatureVisibility?.Hidden ?? "hidden";
}

function toRouteSteps(
  mode: YouBikeLegMode,
  steps: Array<
    Omit<YouBikeRouteStep, "mode" | "durationSeconds"> & {
      durationSeconds?: number;
    }
  >
): YouBikeRouteStep[] {
  return steps.map((step) => ({
    mode,
    instruction: step.instruction,
    streetName: step.streetName,
    distanceMeters: step.distanceMeters,
    durationSeconds: step.durationSeconds ?? 0,
    ...(step.location ? { location: step.location } : {}),
    ...(step.path && step.path.length >= 2 ? { path: step.path } : {}),
    ...(step.maneuver ? { maneuver: step.maneuver } : {}),
  }));
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

function pinEmphasis(
  stationId: string,
  endpointIds: Set<string>
): YouBikeDotEmphasis {
  if (endpointIds.size === 0) return "normal";
  return endpointIds.has(stationId) ? "endpoint" : "dimmed";
}

function applyYouBikePinChrome(
  mk: NonNullable<ReturnType<typeof getMapKit>>,
  annotation: MapKitMarkerAnnotation,
  station: YouBikeStation,
  emphasis: YouBikeDotEmphasis,
  selected: boolean,
  scheme: YouBikeMapScheme
): void {
  annotation.title = youbikePinTitle(station);
  annotation.subtitle = "";
  annotation.subtitleVisibility = featureVisibility(mk, "hidden");
  annotation.titleVisibility = featureVisibility(
    mk,
    selected ? "visible" : "hidden"
  );
  annotation.calloutEnabled = false;
  const size = youbikeDotFramePx(emphasis);
  annotation.size = { width: size, height: size };
  if (annotation.element) {
    applyYouBikeDotAppearance(annotation.element, station, {
      selected,
      emphasis,
      scheme,
    });
  }
}

function createYouBikeAnnotation(
  mk: NonNullable<ReturnType<typeof getMapKit>>,
  station: YouBikeStation,
  clusteringId: string | null,
  emphasis: YouBikeDotEmphasis,
  scheme: YouBikeMapScheme
): MapKitMarkerAnnotation {
  const coord = new mk.Coordinate(station.latitude, station.longitude);
  const color = youbikeStationMarkerColor(station, scheme);
  const hidden = featureVisibility(mk, "hidden");
  const size = youbikeDotFramePx(emphasis);
  const options = {
    title: youbikePinTitle(station),
    subtitle: "",
    titleVisibility: hidden,
    subtitleVisibility: hidden,
    calloutEnabled: false,
    clusteringIdentifier: emphasis === "endpoint" ? null : clusteringId,
    data: { youbikeId: station.id },
    size: { width: size, height: size },
    animates: false,
  };
  if (mk.Annotation) {
    return new mk.Annotation(
      coord,
      () => createYouBikeDotElement(station, { emphasis, scheme }),
      options
    );
  }
  return new mk.MarkerAnnotation(coord, {
    ...options,
    color,
    glyphColor: color,
  });
}

function requestMapKitPath(
  mk: NonNullable<ReturnType<typeof getMapKit>>,
  from: GeoPoint,
  to: GeoPoint,
  kind: MapKitTransportKind
): Promise<{
  path: GeoPoint[];
  distanceMeters?: number;
  durationSeconds?: number;
  steps: ReturnType<typeof extractMapKitRouteSteps>;
} | null> {
  return new Promise((resolve) => {
    if (!mk.Directions) {
      resolve(kind === "Walking" ? { path: [from, to], steps: [] } : null);
      return;
    }
    const transport = resolveMapKitTransport(mk.Directions, kind);
    if (!transport) {
      resolve(null);
      return;
    }
    const directions = new mk.Directions() as MapKitDirectionsInstance;
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(kind === "Walking" ? { path: [from, to], steps: [] } : null);
    }, 8000);
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
            resolve(kind === "Walking" ? { path: [from, to], steps: [] } : null);
            return;
          }
          const metrics = extractMapKitRouteMetrics(route);
          resolve({
            path,
            distanceMeters: metrics.distanceMeters,
            durationSeconds: metrics.durationSeconds,
            steps: extractMapKitRouteSteps(route),
          });
        }
      );
    } catch {
      window.clearTimeout(timer);
      resolve(kind === "Walking" ? { path: [from, to], steps: [] } : null);
    }
  });
}

export function useYouBikeLayer({
  enabled,
  mapReadyTick,
  mapInstanceRef,
  language,
  homePlace,
  workPlace,
  selectedPlace,
  setSelectedPlace,
  recordRecentPlace,
  savedPlaceIds,
  isDarkMode,
  locateMeEnabled,
}: UseYouBikeLayerArgs) {
  const colorScheme = youbikeMapScheme(isDarkMode);
  const [stations, setStations] = useState<YouBikeStation[]>([]);
  const [isLayerVisible, setIsLayerVisible] = useState(false);
  const [isLoadingStations, setIsLoadingStations] = useState(false);
  const [stationError, setStationError] = useState<string | null>(null);
  const [routePlan, setRoutePlan] = useState<YouBikeRoutePlan | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locationTracking, setLocationTracking] = useState(false);
  const [trackedUser, setTrackedUser] = useState<GeoPoint | null>(null);

  const annotationsRef = useRef<
    Map<
      string,
      {
        annotation: MapKitMarkerAnnotation;
        onSelect: () => void;
        onDeselect: () => void;
      }
    >
  >(new Map());
  const overlaysRef = useRef<unknown[]>([]);
  const stationsRef = useRef<YouBikeStation[]>([]);
  const routeRequestIdRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const routeEndpointIdsRef = useRef<Set<string>>(new Set());
  const selectedYoubikeIdRef = useRef<string | null>(null);
  const onSelectStationRef = useRef<(station: YouBikeStation) => void>(
    () => undefined
  );
  const userPuckRef = useRef<MapKitMarkerAnnotation | null>(null);

  const removeUserPuck = useCallback(() => {
    const map = mapInstanceRef.current;
    const puck = userPuckRef.current;
    userPuckRef.current = null;
    if (!puck || !map) return;
    try {
      map.removeAnnotation(puck);
    } catch {
      // ignore
    }
  }, [mapInstanceRef]);

  const upsertUserPuck = useCallback(
    (point: GeoPoint) => {
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (!mk || !map) return;
      const coord = new mk.Coordinate(point.latitude, point.longitude);
      if (userPuckRef.current) {
        userPuckRef.current.coordinate = coord;
        return;
      }
      try {
        const annotation = mk.Annotation
          ? new mk.Annotation(coord, createYouBikeUserPuckElement, {
              title: "",
              calloutEnabled: false,
              animates: false,
            })
          : new mk.MarkerAnnotation(coord, {
              title: "",
              calloutEnabled: false,
              color: "#007aff",
            });
        map.addAnnotation(annotation);
        userPuckRef.current = annotation;
      } catch {
        // ignore
      }
    },
    [mapInstanceRef]
  );

  const followUserOnMap = useCallback((point: GeoPoint) => {
    const mk = getMapKit();
    const map = mapInstanceRef.current;
    if (!mk || !map) return;
    try {
      map.setCenterAnimated(
        new mk.Coordinate(point.latitude, point.longitude),
        true
      );
    } catch {
      // ignore
    }
  }, [mapInstanceRef]);

  const clearStationAnnotations = useCallback(() => {
    const map = mapInstanceRef.current;
    for (const wrapper of annotationsRef.current.values()) {
      try {
        wrapper.annotation.removeEventListener?.("select", wrapper.onSelect);
        wrapper.annotation.removeEventListener?.("deselect", wrapper.onDeselect);
      } catch {
        // ignore
      }
      if (map) {
        try {
          map.removeAnnotation(wrapper.annotation);
        } catch {
          // ignore
        }
      }
    }
    annotationsRef.current = new Map();
  }, [mapInstanceRef]);

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

  const handleSelectStation = useCallback(
    (station: YouBikeStation) => {
      const place = youbikeStationToSavedPlace(station, language);
      recordRecentPlace(place);
      setSelectedPlace(place);
    },
    [language, recordRecentPlace, setSelectedPlace]
  );

  useEffect(() => {
    onSelectStationRef.current = handleSelectStation;
  }, [handleSelectStation]);

  const syncStationAnnotations = useCallback(
    (nextStations: YouBikeStation[]) => {
      selectedYoubikeIdRef.current =
        selectedPlace && isYouBikePlace(selectedPlace)
          ? selectedPlace.id
          : null;
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (!mk || !map) return;

      const region = readMapRegion(map.region);
      const bbox = regionToBBox(region);
      const span = region
        ? Math.max(region.span.latitudeDelta, region.span.longitudeDelta)
        : 1;
      if (!enabled || !bbox || !shouldRenderYouBikeOverlayForSpan(span)) {
        clearStationAnnotations();
        return;
      }

      const renderBbox = padBBox(bbox, RENDER_PAD_FACTOR);
      const visible = filterStationsInBBox(nextStations, renderBbox).filter(
        (station) =>
          !savedPlaceIds.has(station.id) &&
          youbikeShouldPaintDot(station.id, {
            selectedYoubikeId: selectedYoubikeIdRef.current,
            endpointIds: routeEndpointIdsRef.current,
          })
      );
      const visibleIds = new Set(visible.map((station) => station.id));

      const clusteringId = clusteringIdentifierForRegion(
        map.region,
        RYOS_MAP_YOUBIKE_CLUSTER_ID
      );

      for (const [id, wrapper] of annotationsRef.current) {
        if (visibleIds.has(id)) continue;
        try {
          wrapper.annotation.removeEventListener?.("select", wrapper.onSelect);
          wrapper.annotation.removeEventListener?.(
            "deselect",
            wrapper.onDeselect
          );
        } catch {
          // ignore
        }
        try {
          map.removeAnnotation(wrapper.annotation);
        } catch {
          // ignore
        }
        annotationsRef.current.delete(id);
      }

      for (const station of visible) {
        const emphasis = pinEmphasis(station.id, routeEndpointIdsRef.current);
        const bind = (annotation: MapKitMarkerAnnotation) => {
          const isSelected = () =>
            annotation.selected === true ||
            selectedYoubikeIdRef.current === station.id;
          const onSelect = () => {
            applyYouBikePinChrome(
              mk,
              annotation,
              station,
              emphasis,
              true,
              colorScheme
            );
            onSelectStationRef.current(station);
          };
          const onDeselect = () => {
            applyYouBikePinChrome(
              mk,
              annotation,
              station,
              emphasis,
              selectedYoubikeIdRef.current === station.id,
              colorScheme
            );
          };
          try {
            annotation.removeEventListener?.("select", onSelect);
            annotation.removeEventListener?.("deselect", onDeselect);
          } catch {
            // ignore
          }
          const existing = annotationsRef.current.get(station.id);
          if (existing) {
            try {
              existing.annotation.removeEventListener?.(
                "select",
                existing.onSelect
              );
              existing.annotation.removeEventListener?.(
                "deselect",
                existing.onDeselect
              );
            } catch {
              // ignore
            }
          }
          annotation.addEventListener?.("select", onSelect);
          annotation.addEventListener?.("deselect", onDeselect);
          applyYouBikePinChrome(
            mk,
            annotation,
            station,
            emphasis,
            isSelected(),
            colorScheme
          );
          annotation.clusteringIdentifier =
            emphasis === "endpoint" ? null : clusteringId;
          annotationsRef.current.set(station.id, {
            annotation,
            onSelect,
            onDeselect,
          });
        };

        const existing = annotationsRef.current.get(station.id);
        if (existing) {
          bind(existing.annotation);
          continue;
        }

        try {
          const annotation = createYouBikeAnnotation(
            mk,
            station,
            clusteringId,
            emphasis,
            colorScheme
          );
          map.addAnnotation(annotation);
          bind(annotation);
        } catch {
          // ignore
        }
      }
    },
    [
      clearStationAnnotations,
      colorScheme,
      enabled,
      mapInstanceRef,
      savedPlaceIds,
      selectedPlace,
    ]
  );

  const refreshStationsForMap = useCallback(async () => {
    const map = mapInstanceRef.current;
    if (!map || !enabled) {
      setIsLayerVisible(false);
      setStations([]);
      stationsRef.current = [];
      clearStationAnnotations();
      return;
    }
    const region = readMapRegion(map.region);
    const bbox = regionToBBox(region);
    const span = region
      ? Math.max(region.span.latitudeDelta, region.span.longitudeDelta)
      : 1;
    if (!bbox || !bboxIntersectsTaiwan(bbox) || !shouldRenderYouBikeOverlayForSpan(span)) {
      setIsLayerVisible(false);
      if (!shouldRenderYouBikeOverlayForSpan(span)) {
        clearStationAnnotations();
        return;
      }
      setStations([]);
      stationsRef.current = [];
      clearStationAnnotations();
      return;
    }
    if (stationsRef.current.length > 0) {
      syncStationAnnotations(stationsRef.current);
    }
    setIsLayerVisible(true);
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setIsLoadingStations(true);
    setStationError(null);
    try {
      const next = await fetchYouBikeStations(bbox, { signal: controller.signal });
      if (controller.signal.aborted) return;
      stationsRef.current = next;
      setStations(next);
      syncStationAnnotations(next);
    } catch (error) {
      if (controller.signal.aborted) return;
      setStationError(
        error instanceof Error ? error.message : "youbike_fetch_failed"
      );
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingStations(false);
      }
    }
  }, [clearStationAnnotations, enabled, mapInstanceRef, syncStationAnnotations]);

  useEffect(() => {
    if (mapReadyTick === 0) return;
    if (!enabled) {
      setIsLayerVisible(false);
      setStations([]);
      stationsRef.current = [];
      clearStationAnnotations();
      return;
    }
    let cancelled = false;
    let timer = 0;
    const map = mapInstanceRef.current;
    if (!map) return;

    const scheduleRefresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!cancelled) void refreshStationsForMap();
      }, REGION_FETCH_DEBOUNCE_MS);
    };

    scheduleRefresh();
    map.addEventListener?.("region-change-end", scheduleRefresh);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      try {
        map.removeEventListener?.("region-change-end", scheduleRefresh);
      } catch {
        // ignore
      }
    };
  }, [
    clearStationAnnotations,
    enabled,
    mapInstanceRef,
    mapReadyTick,
    refreshStationsForMap,
  ]);

  useEffect(() => {
    return () => {
      clearStationAnnotations();
      clearRouteOverlays();
      removeUserPuck();
    };
  }, [clearRouteOverlays, clearStationAnnotations, removeUserPuck]);

  const drawRouteOverlays = useCallback(
    (plan: YouBikeRoutePlan) => {
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (!mk || !map || !mk.PolylineOverlay) return;
      clearRouteOverlays();
      const overlays: unknown[] = [];
      for (const leg of plan.legs) {
        const path = (leg.path && leg.path.length >= 2 ? leg.path : [leg.from, leg.to]).map(
          (point) => toMapKitCoordinate(mk, point)
        );
        const style = mk.Style
          ? new mk.Style({
              lineWidth: leg.mode === "bike" ? 5 : 4,
              strokeColor:
                leg.mode === "bike" ? YOUBIKE_BIKE_STROKE : YOUBIKE_WALK_STROKE,
              lineCap: "round",
              lineJoin: "round",
            })
          : undefined;
        try {
          const overlay = new mk.PolylineOverlay(path, style ? { style } : undefined);
          overlays.push(overlay);
        } catch {
          // ignore
        }
      }
      if (overlays.length === 0) return;
      try {
        if (map.addOverlays) {
          map.addOverlays(overlays);
        } else {
          for (const overlay of overlays) map.addOverlay?.(overlay);
        }
        overlaysRef.current = overlays;
        const pathPoints = plan.legs.flatMap((leg) =>
          leg.path && leg.path.length >= 2 ? leg.path : [leg.from, leg.to]
        );
        const fitted = regionFittingPoints(pathPoints);
        if (fitted) animateMapToRegion(mk, map, fitted);
      } catch {
        overlaysRef.current = overlays;
      }
    },
    [clearRouteOverlays, mapInstanceRef]
  );

  const enrichRouteGeometry = useCallback(async (plan: YouBikeRoutePlan) => {
    const mk = getMapKit();
    const nextLegs = await Promise.all(
      plan.legs.map(async (leg) => {
        if (leg.mode === "walk") {
          if (!mk) return leg;
          const walking = await requestMapKitPath(mk, leg.from, leg.to, "Walking");
          if (!walking) return leg;
          return {
            ...leg,
            path: walking.path,
            distanceMeters: walking.distanceMeters ?? leg.distanceMeters,
            durationSeconds: walking.durationSeconds ?? leg.durationSeconds,
            steps: toRouteSteps("walk", walking.steps),
          };
        }
        const cycling = mk
          ? await requestMapKitPath(mk, leg.from, leg.to, "Cycling")
          : null;
        if (cycling && cycling.path.length >= 8) {
          return {
            ...leg,
            path: cycling.path,
            distanceMeters: cycling.distanceMeters ?? leg.distanceMeters,
            durationSeconds: cycling.durationSeconds ?? leg.durationSeconds,
            steps: toRouteSteps("bike", cycling.steps),
          };
        }
        const routed = await fetchYouBikeBikeRoute(leg.from, leg.to);
        if (!routed) {
          throw new Error("bike_route_failed");
        }
        return {
          ...leg,
          path: routed.path,
          distanceMeters: routed.distanceMeters || leg.distanceMeters,
          durationSeconds: routed.durationSeconds || leg.durationSeconds,
          steps: toRouteSteps("bike", routed.steps),
        };
      })
    );
    return {
      ...plan,
      legs: nextLegs,
      totalDistanceMeters: nextLegs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
      totalDurationSeconds: nextLegs.reduce(
        (sum, leg) => sum + leg.durationSeconds,
        0
      ),
    };
  }, []);

  const resolveOrigin = useCallback(
    async (destination: GeoPoint): Promise<GeoPoint | { error: string }> => {
      const map = mapInstanceRef.current;
      const user = map?.userLocation?.coordinate;
      if (
        user &&
        isInTaiwan({ latitude: user.latitude, longitude: user.longitude })
      ) {
        return { latitude: user.latitude, longitude: user.longitude };
      }

      const tryGeo = (): Promise<GeoPoint | null> =>
        new Promise((resolve) => {
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
              resolve(isInTaiwan(point) ? point : null);
            },
            () => resolve(null),
            { timeout: 4000, maximumAge: 5 * 60 * 1000 }
          );
        });

      const geo = await tryGeo();
      if (geo) return geo;

      if (homePlace && isInTaiwan(homePlace)) {
        return { latitude: homePlace.latitude, longitude: homePlace.longitude };
      }
      if (workPlace && isInTaiwan(workPlace)) {
        return { latitude: workPlace.latitude, longitude: workPlace.longitude };
      }

      const region = map ? readMapRegion(map.region) : null;
      if (region && isInTaiwan(region.center)) {
        const center = {
          latitude: region.center.latitude,
          longitude: region.center.longitude,
        };
        const dx = Math.abs(center.latitude - destination.latitude);
        const dy = Math.abs(center.longitude - destination.longitude);
        if (dx > 0.002 || dy > 0.002) {
          return center;
        }
      }
      return { error: "no_origin" };
    },
    [homePlace, mapInstanceRef, workPlace]
  );

  const handleYouBikeDirections = useCallback(
    async (destination: SavedPlace) => {
      const destPoint: GeoPoint = {
        latitude: destination.latitude,
        longitude: destination.longitude,
      };
      if (!isInTaiwan(destPoint) && !destination.youbike) {
        setRouteError("destination_not_in_taiwan");
        setRoutePlan(null);
        return;
      }

      setIsRouting(true);
      setRouteError(null);
      const requestId = ++routeRequestIdRef.current;
      try {
        const originOrError = await resolveOrigin(destPoint);
        if ("error" in originOrError) {
          setRouteError(originOrError.error);
          setRoutePlan(null);
          return;
        }

        const south = Math.min(originOrError.latitude, destPoint.latitude) - 0.02;
        const north = Math.max(originOrError.latitude, destPoint.latitude) + 0.02;
        const west = Math.min(originOrError.longitude, destPoint.longitude) - 0.02;
        const east = Math.max(originOrError.longitude, destPoint.longitude) + 0.02;
        const fetched = await fetchYouBikeStations({ south, west, north, east });
        const available = mergeYouBikeStations([stationsRef.current, fetched]);
        stationsRef.current = available;

        const planned = planYouBikeTrip({
          origin: originOrError,
          destination: destPoint,
          originLabel: "Start",
          destinationLabel: destination.name,
          stations: available,
          language,
        });
        if (isYouBikeRouteError(planned)) {
          setRouteError(planned.error);
          setRoutePlan(null);
          return;
        }
        const enriched = await enrichRouteGeometry(planned);
        if (requestId !== routeRequestIdRef.current) return;
        setRoutePlan(enriched);
        drawRouteOverlays(enriched);
      } catch {
        if (requestId !== routeRequestIdRef.current) return;
        setRouteError("route_failed");
        setRoutePlan(null);
      } finally {
        if (requestId === routeRequestIdRef.current) {
          setIsRouting(false);
        }
      }
    },
    [drawRouteOverlays, enrichRouteGeometry, language, resolveOrigin]
  );

  const focusYouBikeStep = useCallback(
    (step: YouBikeRouteStep) => {
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

  const handleClearYouBikeRoute = useCallback(() => {
    routeRequestIdRef.current += 1;
    cancelYouBikeNavigationSpeech();
    setRoutePlan(null);
    setRouteError(null);
    setIsRouting(false);
    clearRouteOverlays();
  }, [clearRouteOverlays]);

  useEffect(() => {
    const shouldWatch = shouldWatchYouBikeUserLocation({ locateMeEnabled });
    if (!shouldWatch || mapReadyTick === 0) {
      removeUserPuck();
      setLocationTracking(false);
      setTrackedUser(null);
      return;
    }

    const map = mapInstanceRef.current;
    if (!map) return;

    setLocationTracking(true);
    let lastPoint: GeoPoint | null = null;
    const applyFix = (point: GeoPoint, mode: "geolocation" | "mapkit") => {
      if (!isDistinctUserLocation(lastPoint, point)) return;
      lastPoint = point;
      setTrackedUser(point);
      if (mode === "geolocation") {
        followUserOnMap(point);
        upsertUserPuck(point);
      }
    };

    const seed = geoPointFromCoords(map.userLocation?.coordinate);
    if (seed) {
      lastPoint = seed;
      setTrackedUser(seed);
    }

    const geolocation =
      typeof navigator !== "undefined" ? navigator.geolocation : null;
    const watch = startYouBikeUserLocationWatch({
      geolocation,
      onUpdate: (point) => applyFix(point, "geolocation"),
    });

    if (watch.source === "geolocation") {
      map.showsUserLocation = false;
      map.tracksUserLocation = false;
      if (seed) {
        followUserOnMap(seed);
        upsertUserPuck(seed);
      }
    } else {
      map.showsUserLocation = true;
      map.tracksUserLocation = true;
    }

    const onMapkitLocation = (event?: unknown) => {
      const fromEvent = coordinateFromUserLocationEvent(event);
      if (fromEvent) {
        applyFix(fromEvent, watch.source === "geolocation" ? "geolocation" : "mapkit");
        return;
      }
      const fromMap = geoPointFromCoords(map.userLocation?.coordinate);
      if (fromMap) {
        applyFix(fromMap, watch.source === "geolocation" ? "geolocation" : "mapkit");
      }
    };
    if (watch.source === "none") {
      map.addEventListener?.("user-location-change", onMapkitLocation);
    }

    return () => {
      watch.stop();
      if (watch.source === "none") {
        try {
          map.removeEventListener?.("user-location-change", onMapkitLocation);
        } catch {
          // ignore
        }
      }
      removeUserPuck();
    };
  }, [
    followUserOnMap,
    locateMeEnabled,
    mapInstanceRef,
    mapReadyTick,
    removeUserPuck,
    upsertUserPuck,
  ]);

  const activeStepIndex = useMemo(() => {
    if (!locationTracking || !trackedUser || !routePlan) return null;
    return youbikeNextStepIndex(listYouBikeRouteSteps(routePlan), trackedUser);
  }, [locationTracking, routePlan, trackedUser]);

  useEffect(() => {
    const ids = new Set<string>();
    if (routePlan?.originStation?.id) ids.add(routePlan.originStation.id);
    if (routePlan?.destinationStation?.id) {
      ids.add(routePlan.destinationStation.id);
    }
    routeEndpointIdsRef.current = ids;
    selectedYoubikeIdRef.current =
      selectedPlace && isYouBikePlace(selectedPlace) ? selectedPlace.id : null;
    if (stationsRef.current.length > 0) {
      syncStationAnnotations(stationsRef.current);
    }
  }, [routePlan, selectedPlace, syncStationAnnotations]);

  const selectedYoubikeStation =
    selectedPlace &&
    stations.find((station) => station.id === selectedPlace.id);

  return {
    stations,
    isLayerVisible,
    isLoadingStations,
    stationError,
    routePlan,
    isRouting,
    routeError,
    selectedYoubikeStation,
    handleYouBikeDirections,
    handleClearYouBikeRoute,
    focusYouBikeStep,
    activeStepIndex,
    trackedUser,
  };
}
