import {
  useCallback,
  useEffect,
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
  type GeoBBox,
  type GeoPoint,
  type YouBikeRoutePlan,
  type YouBikeStation,
} from "../youbike";
import { fetchYouBikeStations } from "../youbike/fetchStations";
import { mergeYouBikeStations } from "../youbike/parseStations";
import { youbikeStationToSavedPlace } from "../youbike/place";
import { isYouBikeRouteError, planYouBikeTrip } from "../youbike/routePlan";
import {
  YOUBIKE_BIKE_STROKE,
  YOUBIKE_WALK_STROKE,
  getYouBikeGlyphImage,
  youbikeStationMarkerColor,
} from "../youbike/stationVisuals";
import {
  getMapKit,
  type MapKitCoordinate,
  type MapKitDirectionsInstance,
  type MapKitMapInstance,
  type MapKitMarkerAnnotation,
} from "../components/maps-app/mapKitTypes";
import { readMapRegion } from "../components/maps-app/mapRegionUtils";

/** Don't fetch or paint when the island is a postage stamp. */
const MAX_RENDER_SPAN_DEG = 0.4;
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

function requestWalkingPath(
  mk: NonNullable<ReturnType<typeof getMapKit>>,
  from: GeoPoint,
  to: GeoPoint
): Promise<{ path: GeoPoint[]; distanceMeters?: number; durationSeconds?: number }> {
  return new Promise((resolve) => {
    if (!mk.Directions) {
      resolve({ path: [from, to] });
      return;
    }
    const directions = new mk.Directions() as MapKitDirectionsInstance;
    const transport =
      (mk.Directions as unknown as { Transport?: { Walking?: string } }).Transport
        ?.Walking ?? "Walking";
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ path: [from, to] });
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
          if (error || !route?.path || route.path.length < 2) {
            resolve({ path: [from, to] });
            return;
          }
          resolve({
            path: route.path.map((coord) => ({
              latitude: coord.latitude,
              longitude: coord.longitude,
            })),
            distanceMeters:
              typeof route.distance === "number" ? route.distance : undefined,
            durationSeconds:
              typeof route.expectedTravelTime === "number"
                ? route.expectedTravelTime
                : undefined,
          });
        }
      );
    } catch {
      window.clearTimeout(timer);
      resolve({ path: [from, to] });
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
}: UseYouBikeLayerArgs) {
  const [stations, setStations] = useState<YouBikeStation[]>([]);
  const [isLayerVisible, setIsLayerVisible] = useState(false);
  const [isLoadingStations, setIsLoadingStations] = useState(false);
  const [stationError, setStationError] = useState<string | null>(null);
  const [routePlan, setRoutePlan] = useState<YouBikeRoutePlan | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const annotationsRef = useRef<
    Map<
      string,
      { annotation: MapKitMarkerAnnotation; onSelect: () => void }
    >
  >(new Map());
  const overlaysRef = useRef<unknown[]>([]);
  const stationsRef = useRef<YouBikeStation[]>([]);
  const routeRequestIdRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const onSelectStationRef = useRef<(station: YouBikeStation) => void>(
    () => undefined
  );

  const clearStationAnnotations = useCallback(() => {
    const map = mapInstanceRef.current;
    for (const wrapper of annotationsRef.current.values()) {
      try {
        wrapper.annotation.removeEventListener?.("select", wrapper.onSelect);
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
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (!mk || !map) return;

      const region = readMapRegion(map.region);
      const bbox = regionToBBox(region);
      const span = region
        ? Math.max(region.span.latitudeDelta, region.span.longitudeDelta)
        : 1;
      if (!enabled || !bbox || span > MAX_RENDER_SPAN_DEG) {
        clearStationAnnotations();
        return;
      }

      const renderBbox = padBBox(bbox, RENDER_PAD_FACTOR);
      const visible = filterStationsInBBox(nextStations, renderBbox).filter(
        (station) => !savedPlaceIds.has(station.id)
      );
      const visibleIds = new Set(visible.map((station) => station.id));

      const clusteringId = clusteringIdentifierForRegion(
        map.region,
        RYOS_MAP_YOUBIKE_CLUSTER_ID
      );
      const glyph = getYouBikeGlyphImage();
      const hidden =
        mk.FeatureVisibility?.Hidden ?? "hidden";

      for (const [id, wrapper] of annotationsRef.current) {
        if (visibleIds.has(id)) continue;
        try {
          wrapper.annotation.removeEventListener?.("select", wrapper.onSelect);
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
        const existing = annotationsRef.current.get(station.id);
        if (existing) {
          const color = youbikeStationMarkerColor(station);
          if (existing.annotation.color !== color) {
            existing.annotation.color = color;
          }
          existing.annotation.clusteringIdentifier = clusteringId;
          const onSelect = () => {
            onSelectStationRef.current(station);
          };
          try {
            existing.annotation.removeEventListener?.("select", existing.onSelect);
          } catch {
            // ignore
          }
          existing.annotation.addEventListener?.("select", onSelect);
          annotationsRef.current.set(station.id, {
            annotation: existing.annotation,
            onSelect,
          });
          continue;
        }

        const coord = new mk.Coordinate(station.latitude, station.longitude);
        const annotation = new mk.MarkerAnnotation(coord, {
          color: youbikeStationMarkerColor(station),
          glyphColor: "#ffffff",
          glyphImage: glyph,
          selectedGlyphImage: glyph,
          clusteringIdentifier: clusteringId,
          titleVisibility: hidden,
          subtitleVisibility: hidden,
          calloutEnabled: false,
          data: { youbikeId: station.id },
        });
        const onSelect = () => {
          onSelectStationRef.current(station);
        };
        annotation.addEventListener?.("select", onSelect);
        try {
          map.addAnnotation(annotation);
          annotationsRef.current.set(station.id, { annotation, onSelect });
        } catch {
          // ignore
        }
      }
    },
    [clearStationAnnotations, enabled, mapInstanceRef, savedPlaceIds]
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
    if (!bbox || !bboxIntersectsTaiwan(bbox) || span > MAX_RENDER_SPAN_DEG) {
      setIsLayerVisible(false);
      if (span > MAX_RENDER_SPAN_DEG) {
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
    };
  }, [clearRouteOverlays, clearStationAnnotations]);

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
        if (fitted) {
          const center = new mk.Coordinate(
            fitted.center.latitude,
            fitted.center.longitude
          );
          const span = new mk.CoordinateSpan(
            fitted.latitudeDelta,
            fitted.longitudeDelta
          );
          map.setRegionAnimated(new mk.CoordinateRegion(center, span), true);
        }
      } catch {
        overlaysRef.current = overlays;
      }
    },
    [clearRouteOverlays, mapInstanceRef]
  );

  const enrichWalkLegs = useCallback(async (plan: YouBikeRoutePlan) => {
    const mk = getMapKit();
    if (!mk) return plan;
    const nextLegs = await Promise.all(
      plan.legs.map(async (leg) => {
        if (leg.mode !== "walk") return leg;
        const walking = await requestWalkingPath(mk, leg.from, leg.to);
        return {
          ...leg,
          path: walking.path,
          distanceMeters: walking.distanceMeters ?? leg.distanceMeters,
          durationSeconds: walking.durationSeconds ?? leg.durationSeconds,
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
        const enriched = await enrichWalkLegs(planned);
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
    [drawRouteOverlays, enrichWalkLegs, language, resolveOrigin]
  );

  const handleClearYouBikeRoute = useCallback(() => {
    routeRequestIdRef.current += 1;
    setRoutePlan(null);
    setRouteError(null);
    setIsRouting(false);
    clearRouteOverlays();
  }, [clearRouteOverlays]);

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
  };
}
