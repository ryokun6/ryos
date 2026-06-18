import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
} from "react";
import type { AppProps } from "@/apps/base/types";
import { useMapsLogic } from "../../hooks/useMapsLogic";
import { useMapKit } from "../../hooks/useMapKit";
import { useMapsStore } from "@/stores/useMapsStore";
import type { SavedPlace } from "../../utils/types";
import { getPoiMarkerAnnotationOptions } from "../../utils/poiMarkerStyle";
import { buildAppleMapsDrivingDirectionsUrl } from "../../utils/appleMapsLinks";
import {
  homeMarkerAnnotationStyle,
  workMarkerAnnotationStyle,
} from "../../utils/savedPlaceVisuals";
import {
  RYOS_MAP_PLACES_CLUSTER_ID,
  clusteringIdentifierForRegion,
  formatClusterMarkerTitle,
  withMapPlaceClustering,
} from "../../utils/mapMarkerClustering";
import { MAPS_ANALYTICS, track } from "@/utils/analytics";
import {
  getMapKit,
  isDarkModeToMapKit,
  mapTypeToMapKit,
  type MapKitMapInstance,
  type MapKitMarkerAnnotation,
  type MapKitPlace,
  type MapKitRegionPriority,
  type MapKitSearchInstance,
} from "./mapKitTypes";
import {
  CITY_LEVEL_SPAN_DEG,
  FOCUS_PLACE_SPAN_DEG,
  INITIAL_LOCATION_TIMEOUT_MS,
  LOADING_OVERLAY_DELAY_MS,
  MAP_ZOOM_STEP_FACTOR,
  initialUiState,
  mapsUiReducer,
  type MapsSearchResult,
} from "./mapsUiState";
import {
  clampMapSpanDegrees,
  readMapRegion,
  statusMessageKey,
} from "./mapRegionUtils";

export type UseMapsAppControllerArgs = Pick<AppProps, "isWindowOpen">;

export function useMapsAppController({ isWindowOpen }: UseMapsAppControllerArgs) {
  const {
    t,
    translatedHelpItems,
    isWindowsTheme,
    isMacOSTheme,
    isDarkMode,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    mapType,
    setMapType,
    mapKitLanguage,
  } = useMapsLogic();

  const { status, error, hasToken } = useMapKit({
    enabled: isWindowOpen,
    language: mapKitLanguage,
  });

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapKitMapInstance | null>(null);
  const annotationRef = useRef<MapKitMarkerAnnotation | null>(null);
  const searchInstanceRef = useRef<MapKitSearchInstance | null>(null);
  const searchRequestIdRef = useRef(0);
  // Saved-place annotations (Home / Work / Favorites) keyed by a stable
  // composite key so we can diff updates in-place without rebuilding the
  // entire annotation set on every store change.
  const savedAnnotationsRef = useRef<
    Map<
      string,
      {
        annotation: MapKitMarkerAnnotation;
        place: SavedPlace;
        onSelect: () => void;
      }
    >
  >(new Map());
  const mapMarkersClusteredRef = useRef(false);
  const regionChangeEndListenerRef = useRef<(() => void) | null>(null);
  // Bump every time the underlying MapKit instance is (re)created so any
  // effect that wants to act on `mapInstanceRef.current` can subscribe via
  // a real React dep — refs alone don't trigger re-renders, which made
  // the saved-annotations sync silently miss the first map-ready window
  // when status flipped to "ready" mid-render.
  const [mapReadyTick, setMapReadyTick] = useState(0);
  /** Set when the map container DOM mounts; cleared when it unmounts (e.g. minimize). */
  const [mapSurfaceEl, setMapSurfaceEl] = useState<HTMLDivElement | null>(null);
  // Framed viewport once per fresh MapKit instance (reset when the map is torn down).
  const hasHydratedSelectedRef = useRef(false);
  const lastFocusedPlaceIdRef = useRef<string | null>(null);

  const tearDownMapsMapInstance = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const regionListener = regionChangeEndListenerRef.current;
    if (regionListener) {
      try {
        map.removeEventListener?.("region-change-end", regionListener);
      } catch {
        // ignore
      }
      regionChangeEndListenerRef.current = null;
    }
    try {
      map.destroy();
    } catch {
      // ignore — mapkit may have already cleaned up
    }
    mapInstanceRef.current = null;
    annotationRef.current = null;
    mapMarkersClusteredRef.current = false;
    savedAnnotationsRef.current = new Map();
    hasHydratedSelectedRef.current = false;
    lastFocusedPlaceIdRef.current = null;
    setMapReadyTick(0);
  }, []);

  const attachMapSurfaceRef = useCallback(
    (el: HTMLDivElement | null) => {
      mapContainerRef.current = el;
      if (!el) {
        tearDownMapsMapInstance();
        setMapSurfaceEl(null);
        return;
      }
      setMapSurfaceEl(el);
    },
    [tearDownMapsMapInstance]
  );

  const [uiState, dispatchUi] = useReducer(mapsUiReducer, initialUiState);
  const {
    searchQuery,
    searchResults,
    isSearching,
    searchError,
    selectedResultId,
    isShowingResults,
    isPlacesDrawerOpen,
    showLoadingOverlay,
  } = uiState;

  // Persistent Home / Work / Favorites / Recents + currently-open place.
  const homePlace = useMapsStore((s) => s.home);
  const workPlace = useMapsStore((s) => s.work);
  const favoritePlaces = useMapsStore((s) => s.favorites);
  const recentPlaces = useMapsStore((s) => s.recents);
  const selectedPlace = useMapsStore((s) => s.selectedPlace);
  const setHomePlace = useMapsStore((s) => s.setHome);
  const setWorkPlace = useMapsStore((s) => s.setWork);
  const addFavoritePlace = useMapsStore((s) => s.addFavorite);
  const removeFavoritePlace = useMapsStore((s) => s.removeFavorite);
  const recordRecentPlace = useMapsStore((s) => s.recordRecent);
  const setSelectedPlace = useMapsStore((s) => s.setSelectedPlace);
  const isPlaceFavorite = useCallback(
    (id: string) => favoritePlaces.some((p) => p.id === id),
    [favoritePlaces]
  );

  const applyClusteringToMapMarkers = useCallback((clusteringId: string | null) => {
    const apply = (annotation: MapKitMarkerAnnotation | null) => {
      if (!annotation) return;
      try {
        annotation.clusteringIdentifier = clusteringId;
      } catch {
        // ignore — MapKit may reject updates on detached annotations
      }
    };
    apply(annotationRef.current);
    for (const { annotation } of savedAnnotationsRef.current.values()) {
      apply(annotation);
    }
  }, []);

  const syncMapMarkerClustering = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const clusteringId = clusteringIdentifierForRegion(map.region);
    const shouldCluster = clusteringId !== null;
    if (shouldCluster === mapMarkersClusteredRef.current) return;
    mapMarkersClusteredRef.current = shouldCluster;
    applyClusteringToMapMarkers(clusteringId);
  }, [applyClusteringToMapMarkers]);

  const syncMapMarkerClusteringRef = useRef(syncMapMarkerClustering);
  useEffect(() => {
    syncMapMarkerClusteringRef.current = syncMapMarkerClustering;
  }, [syncMapMarkerClustering]);

  const clusteringIdForCurrentMapRegion = useCallback((): string | null => {
    const map = mapInstanceRef.current;
    if (!map) return null;
    return clusteringIdentifierForRegion(map.region);
  }, []);

  // Initialize the map instance once mapkit is ready, the window is open,
  // and the map surface is mounted (it unmounts while minimized unless
  // WindowFrame keeps content mounted).
  useEffect(() => {
    if (!isWindowOpen) return;
    if (status !== "ready") return;
    const mk = getMapKit();
    if (!mk) return;
    if (mapInstanceRef.current) return;
    if (!mapSurfaceEl) return;

    // Default region: San Francisco. We center here so the map opens on a
    // useful, POI-rich location instead of the world view, and switch to
    // the user's real location only when they hit "Locate Me".
    const SF_LATITUDE = 37.7749;
    const SF_LONGITUDE = -122.4194;
    const SF_LATITUDE_DELTA = 0.12;
    const SF_LONGITUDE_DELTA = 0.12;
    const center = new mk.Coordinate(SF_LATITUDE, SF_LONGITUDE);
    const span = new mk.CoordinateSpan(SF_LATITUDE_DELTA, SF_LONGITUDE_DELTA);
    const region = new mk.CoordinateRegion(center, span);

    const map = new mk.Map(mapSurfaceEl, {
      showsZoomControl: false,
      showsCompass: "hidden",
      showsScale: "adaptive",
      showsMapTypeControl: false,
      showsUserLocationControl: false,
      isRotationEnabled: true,
      // Show all points of interest by default. `null` is MapKit's "no
      // filter" sentinel which means every POI category is rendered.
      pointOfInterestFilter: null,
      region,
      colorScheme: isDarkModeToMapKit(isDarkMode),
    });
    map.mapType = mapTypeToMapKit(mapType);
    map.colorScheme = isDarkModeToMapKit(isDarkMode);
    map.showsUserLocation = false;
    map.tracksUserLocation = false;
    map.annotationForCluster = (cluster) => {
      if (cluster.clusteringIdentifier !== RYOS_MAP_PLACES_CLUSTER_ID) {
        return;
      }
      cluster.title = formatClusterMarkerTitle(cluster.memberAnnotations);
      cluster.subtitle = "";
      return cluster;
    };
    const onRegionChangeEnd = () => {
      syncMapMarkerClusteringRef.current();
    };
    regionChangeEndListenerRef.current = onRegionChangeEnd;
    map.addEventListener?.("region-change-end", onRegionChangeEnd);
    mapMarkersClusteredRef.current =
      clusteringIdentifierForRegion(region) !== null;
    mapInstanceRef.current = map;
    // Notify dependents (saved-annotations sync, hydration framing, etc.)
    // that the underlying map instance is ready. Bumping a counter forces
    // a re-render so effects that read `mapInstanceRef.current` actually
    // see the new value instead of skipping it on a stale closure.
    setMapReadyTick((tick) => tick + 1);
    return () => {
      try {
        map.removeEventListener?.("region-change-end", onRegionChangeEnd);
      } catch {
        // ignore
      }
    };
    // We intentionally do NOT depend on mapType here — the next effect
    // syncs it whenever the user picks a different option.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWindowOpen, status, mapSurfaceEl]);

  // MapKit measures its container at creation time; if the surface was hidden,
  // had zero size, or animates in (minimize/restore), nudge it on layout changes.
  useEffect(() => {
    if (mapReadyTick === 0) return;
    const el = mapContainerRef.current;
    if (!el || !mapInstanceRef.current) return;

    let raf = 0;
    const nudgeMapLayout = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        window.dispatchEvent(new Event("resize"));
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event("resize"));
        });
      });
    };

    nudgeMapLayout();
    const ro = new ResizeObserver(() => nudgeMapLayout());
    ro.observe(el);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mapReadyTick]);

  // Sync map type when the user changes it via the View menu.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.mapType = mapTypeToMapKit(mapType);
  }, [mapType]);

  // Sync MapKit's `colorScheme` when the ryOS theme's dark-mode flag flips
  // (Aqua is the only theme that supports dark mode today). MapKit only
  // applies the value to `Standard`/`MutedStandard`, but assigning while
  // on Hybrid/Satellite is harmless — the new value sticks and takes
  // effect the next time the user switches back to a standard map type.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.colorScheme = isDarkModeToMapKit(isDarkMode);
  }, [isDarkMode, mapReadyTick]);

  // Tear down the map instance when the window closes or the component
  // unmounts so repeated open/close cycles don't leak DOM nodes.
  useEffect(() => {
    if (isWindowOpen) return;
    tearDownMapsMapInstance();
  }, [isWindowOpen, tearDownMapsMapInstance]);

  useEffect(() => {
    return () => {
      tearDownMapsMapInstance();
    };
  }, [tearDownMapsMapInstance]);

  const performSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        dispatchUi({ type: "searchReset" });
        return;
      }
      const mk = getMapKit();
      if (!mk || status !== "ready") return;

      // Reuse a single Search instance across calls. We deliberately omit
      // `getsUserLocation: true` because requesting browser geolocation on
      // every keystroke adds 1–10s of latency and triggers a permission
      // prompt — biasing by the visible map region (below) gives much
      // better POI relevance without that cost.
      if (!searchInstanceRef.current) {
        searchInstanceRef.current = new mk.Search() as MapKitSearchInstance;
      }
      const search = searchInstanceRef.current;

      // Bias results to the visible map region so "coffee" returns nearby
      // shops instead of a globally-ranked list. Falling back to no region
      // on the very first call (before the map renders) is fine.
      const map = mapInstanceRef.current;
      const region = map?.region;
      // Promote the region hint to a hard filter via MapKit JS 5.78's
      // `regionPriority: "required"` ONLY when the visible region falls
      // inside a Goldilocks band:
      //   • Upper bound (~50 km / 0.5°): when zoomed out farther than
      //     this, "Eiffel Tower" needs to escape the local region.
      //   • Lower bound (~3 km / 0.03°): when zoomed in tighter than
      //     this, the viewport may not contain any matches for the
      //     query — locking the search to that tiny box returns zero
      //     results. Fall back to the default soft bias so MapKit can
      //     widen the search and surface useful nearby hits.
      // Outside the band we use the default soft region bias.
      const REGION_REQUIRED_MAX_SPAN_DEG = 0.5;
      const REGION_REQUIRED_MIN_SPAN_DEG = 0.03;
      const regionSpan = (region as
        | { span?: { latitudeDelta?: number; longitudeDelta?: number } }
        | undefined)?.span;
      const latDelta = regionSpan?.latitudeDelta;
      const lngDelta = regionSpan?.longitudeDelta;
      const shouldRequireRegion =
        !!region &&
        typeof latDelta === "number" &&
        typeof lngDelta === "number" &&
        latDelta < REGION_REQUIRED_MAX_SPAN_DEG &&
        lngDelta < REGION_REQUIRED_MAX_SPAN_DEG &&
        latDelta >= REGION_REQUIRED_MIN_SPAN_DEG &&
        lngDelta >= REGION_REQUIRED_MIN_SPAN_DEG;
      const regionPriorityValue: MapKitRegionPriority | undefined = region
        ? shouldRequireRegion
          ? mk.RegionPriority?.Required ?? "required"
          : mk.RegionPriority?.Default ?? "default"
        : undefined;

      const requestId = ++searchRequestIdRef.current;
      dispatchUi({ type: "searchStart" });
      track(MAPS_ANALYTICS.SEARCH, {
        appId: "maps",
        queryLength: trimmed.length,
        regionRequired: shouldRequireRegion,
      });

      search.search(
        trimmed,
        (err, data) => {
          // Ignore stale callbacks (user typed and re-searched in the
          // meantime). MapKit doesn't expose a cancel API, so we discard.
          if (requestId !== searchRequestIdRef.current) return;

          if (err) {
            dispatchUi({
              type: "searchError",
              error:
                err.message ||
                t("apps.maps.searchFailed", { defaultValue: "Search failed" }),
            });
            track("maps:search_error", {
              appId: "maps",
              queryLength: trimmed.length,
              errorType: "mapkit_search",
            });
            return;
          }
          const places = data?.places ?? [];
          const mapped: MapsSearchResult[] = places.reduce<MapsSearchResult[]>(
            (acc, place, index) => {
              if (!place?.coordinate) {
                return acc;
              }

              acc.push({
                // Prefer Apple's stable Place ID (5.78+) when available so
                // re-selecting the same result across sessions / search
                // refreshes hits the same `SavedPlace` entry. Falls back to
                // the coordinate-based composite for older MapKit JS.
                id:
                  place.id ||
                  `${place.coordinate.latitude},${place.coordinate.longitude},${index}`,
                name: place.name || place.formattedAddress || trimmed,
                subtitle: place.formattedAddress || "",
                coordinate: place.coordinate,
                category: place.pointOfInterestCategory,
                placeId: place.id,
                place,
              });
              return acc;
            },
            []
          );
          dispatchUi({ type: "searchSuccess", results: mapped });
        },
        region
          ? regionPriorityValue
            ? { region, regionPriority: regionPriorityValue }
            : { region }
          : undefined
      );
    },
    [status, t]
  );

  // Latest "is this id a saved place?" predicate, captured into a ref so
  // `dropPinAt` can stay stable (no callback dep churn) while still seeing
  // up-to-date Home / Work / Favorites state.
  const isPlaceSavedRef = useRef<(id: string | undefined) => boolean>(
    () => false
  );

  const dropPinAt = useCallback(
    (place: {
      id: string;
      name: string;
      subtitle?: string;
      latitude: number;
      longitude: number;
      category?: string;
      /** When set, passed through to MapKit to supersede the built-in POI. */
      mapKitPlace?: MapKitPlace;
    }) => {
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (!mk || !map) return;

      // If the place already has a permanent saved annotation, skip the
      // search pin entirely and just frame it. This keeps clicks on
      // search results that match a Favorite from stacking two markers.
      const alreadySaved = isPlaceSavedRef.current(place.id);

      if (annotationRef.current) {
        try {
          map.removeAnnotation(annotationRef.current);
        } catch {
          // ignore
        }
        annotationRef.current = null;
      }

      const coord = new mk.Coordinate(place.latitude, place.longitude);
      if (!alreadySaved) {
        dispatchUi({ type: "setSelectedResultId", id: place.id });
        const annotation = new mk.MarkerAnnotation(
          coord,
          withMapPlaceClustering(
            getPoiMarkerAnnotationOptions(
              place.name,
              place.subtitle ?? "",
              place.category,
              {
                ...(place.mapKitPlace ? { place: place.mapKitPlace } : {}),
              }
            ),
            clusteringIdForCurrentMapRegion()
          )
        );
        map.addAnnotation(annotation);
        annotationRef.current = annotation;
      } else {
        dispatchUi({ type: "setSelectedResultId", id: null });
      }

      const span = new mk.CoordinateSpan(
        FOCUS_PLACE_SPAN_DEG,
        FOCUS_PLACE_SPAN_DEG
      );
      const region = new mk.CoordinateRegion(coord, span);
      map.setRegionAnimated(region, true);
    },
    [clusteringIdForCurrentMapRegion]
  );

  const handleSelectResult = useCallback(
    (result: MapsSearchResult) => {
      dispatchUi({ type: "setShowingResults", isShowingResults: false });
      track(MAPS_ANALYTICS.PLACE_SELECT, {
        appId: "maps",
        source: "search",
        category: result.category || "unknown",
      });
      dropPinAt({
        id: result.id,
        name: result.name,
        subtitle: result.subtitle,
        latitude: result.coordinate.latitude,
        longitude: result.coordinate.longitude,
        category: result.category,
        mapKitPlace: result.place,
      });

      const saved: SavedPlace = {
        id: result.id,
        name: result.name,
        subtitle: result.subtitle,
        latitude: result.coordinate.latitude,
        longitude: result.coordinate.longitude,
        category: result.category,
        placeId: result.placeId,
      };
      recordRecentPlace(saved);
      setSelectedPlace(saved);
    },
    [dropPinAt, recordRecentPlace, setSelectedPlace]
  );

  // Center + record recent for a saved place, and visually highlight its
  // pin by flipping MapKit's `selected` flag on the annotation. We
  // deliberately do NOT call `dropPinAt` here because Home / Work /
  // Favorites already have their own permanent annotations on the map —
  // adding a red search pin on top would duplicate the marker. Instead
  // we re-use the saved annotation as the "you are here" indicator.
  const focusSavedPlace = useCallback(
    (place: SavedPlace) => {
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (mk && map) {
        const coord = new mk.Coordinate(place.latitude, place.longitude);
        const span = new mk.CoordinateSpan(
          FOCUS_PLACE_SPAN_DEG,
          FOCUS_PLACE_SPAN_DEG
        );
        const region = new mk.CoordinateRegion(coord, span);
        map.setRegionAnimated(region, true);
      }
      // Clear any leftover search pin so the saved annotation is the
      // only marker visible at this location.
      if (annotationRef.current && map) {
        try {
          map.removeAnnotation(annotationRef.current);
        } catch {
          // ignore
        }
        annotationRef.current = null;
        dispatchUi({ type: "setSelectedResultId", id: null });
      }
      // Highlight the matching saved annotation so it's obvious which
      // pin corresponds to the now-open place card. `selected = true`
      // pops the callout; we deselect the rest so only one is active.
      const wrappers = savedAnnotationsRef.current;
      for (const [id, wrapper] of wrappers.entries()) {
        try {
          wrapper.annotation.selected = id === place.id;
        } catch {
          // MapKit JS forbids mutating selection inside a select/deselect
          // callback; this code path runs from a tap handler so it's
          // normally safe, but ignore in case MapKit complains.
        }
      }
      recordRecentPlace(place);
      setSelectedPlace(place);
    },
    [recordRecentPlace, setSelectedPlace]
  );

  // Keep the latest focus handler in a ref so the long-lived MapKit click
  // listeners attached to saved annotations always invoke the current
  // closure (and therefore the current store setters) without forcing us
  // to rebuild every annotation when callbacks change.
  const focusSavedPlaceRef = useRef(focusSavedPlace);
  useEffect(() => {
    focusSavedPlaceRef.current = focusSavedPlace;
  }, [focusSavedPlace]);

  const handleSelectSavedPlace = useCallback(
    (place: SavedPlace) => {
      track(MAPS_ANALYTICS.PLACE_SELECT, {
        appId: "maps",
        source: "saved",
        category: place.category || "unknown",
      });
      focusSavedPlace(place);
    },
    [focusSavedPlace]
  );

  // Remove the dropped annotation (if any) and clear the selected-result
  // highlight in the search list. Used both by the "close card" button and
  // when toggling Home/Work mutations don't apply.
  const clearDroppedAnnotation = useCallback(() => {
    const map = mapInstanceRef.current;
    if (map && annotationRef.current) {
      try {
        map.removeAnnotation(annotationRef.current);
      } catch {
        // ignore
      }
    }
    annotationRef.current = null;
    dispatchUi({ type: "setSelectedResultId", id: null });
  }, []);

  const handleClosePlaceCard = useCallback(() => {
    setSelectedPlace(null);
    clearDroppedAnnotation();
  }, [setSelectedPlace, clearDroppedAnnotation]);

  const handleOpenPlaceDirections = useCallback((place: SavedPlace) => {
    track(MAPS_ANALYTICS.DIRECTIONS, {
      appId: "maps",
      category: place.category || "unknown",
    });
    const url = buildAppleMapsDrivingDirectionsUrl(
      place.latitude,
      place.longitude
    );
    window.location.assign(url);
  }, []);

  const handleToggleFavorite = useCallback(
    (place: SavedPlace) => {
      const willFavorite = !isPlaceFavorite(place.id);
      track(MAPS_ANALYTICS.FAVORITE_TOGGLE, {
        appId: "maps",
        enabled: willFavorite,
        category: place.category || "unknown",
      });
      if (!willFavorite) {
        removeFavoritePlace(place.id);
      } else {
        addFavoritePlace(place);
      }
    },
    [isPlaceFavorite, removeFavoritePlace, addFavoritePlace]
  );

  // Localized "Home" / "Work" labels used as the marker title for those
  // saved kinds, matching the drawer and place-card section headings.
  const homeLabel = t("apps.maps.places.home", { defaultValue: "Home" });
  const workLabel = t("apps.maps.places.work", { defaultValue: "Work" });

  // Resolve the saved-place entries we want to render as map annotations.
  // We dedupe by `SavedPlace.id` so a favorite that's also Home or Work is
  // rendered once (Home/Work win) — two pins stacked at the same coordinate
  // would just be visual noise.
  const savedPlaceEntries = useMemo<
    Array<{ kind: "home" | "work" | "favorite"; place: SavedPlace }>
  >(() => {
    const entries: Array<{
      kind: "home" | "work" | "favorite";
      place: SavedPlace;
    }> = [];
    const seen = new Set<string>();
    if (homePlace) {
      entries.push({ kind: "home", place: homePlace });
      seen.add(homePlace.id);
    }
    if (workPlace && !seen.has(workPlace.id)) {
      entries.push({ kind: "work", place: workPlace });
      seen.add(workPlace.id);
    }
    for (const fav of favoritePlaces) {
      if (seen.has(fav.id)) continue;
      entries.push({ kind: "favorite", place: fav });
      seen.add(fav.id);
    }
    return entries;
  }, [homePlace, workPlace, favoritePlaces]);

  // Sync Home / Work / Favorites annotations on the map. Home / Work use
  // branded pins; favorites use the same category icon + color as the
  // place card and search list (`getPoiMarkerStyle`).
  //
  // We deliberately wipe-and-rebuild the entire annotation set on every
  // run rather than diffing. The diff approach (used previously) traded a
  // tiny perf win for a class of bugs where a key collision or store
  // re-hydration left favorites silently missing from the map. With at
  // most ~10 saved places, the cost of re-creating annotations is
  // negligible and the code stays trivially correct.
  //
  // The handler stored on each annotation reads from `focusSavedPlaceRef`,
  // so the listener stays valid for the lifetime of the annotation even
  // though we recreate annotations whenever entries change.
  useEffect(() => {
    if (status !== "ready") return;
    const mk = getMapKit();
    const map = mapInstanceRef.current;
    if (!mk || !map) return;

    // Drop all previously-attached saved annotations before re-adding.
    for (const value of savedAnnotationsRef.current.values()) {
      try {
        value.annotation.removeEventListener?.("select", value.onSelect);
      } catch {
        // ignore — mapkit may have already detached
      }
      try {
        map.removeAnnotation(value.annotation);
      } catch {
        // ignore — mapkit may have already detached
      }
    }
    const next = new Map<
      string,
      {
        annotation: MapKitMarkerAnnotation;
        place: SavedPlace;
        onSelect: () => void;
      }
    >();

    for (const entry of savedPlaceEntries) {
      const coord = new mk.Coordinate(
        entry.place.latitude,
        entry.place.longitude
      );
      // Per-kind marker color + Phosphor-derived glyph image. The glyph
      // hash is the same `data:` SVG for all three densities — Apple's
      // docs require ≥ 20×20 with 40×40 recommended; SVG scales for all.
      const title =
        entry.kind === "home"
          ? homeLabel
          : entry.kind === "work"
            ? workLabel
            : entry.place.name;
      const subtitle =
        entry.kind === "home" || entry.kind === "work"
          ? entry.place.name
          : (entry.place.subtitle ?? "");

      const clusteringId = clusteringIdForCurrentMapRegion();
      const markerOptions =
        entry.kind === "favorite"
          ? getPoiMarkerAnnotationOptions(title, subtitle, entry.place.category, {
              displayPriority: 1000,
              selected: false,
            })
          : entry.kind === "home"
            ? homeMarkerAnnotationStyle(title, subtitle)
            : workMarkerAnnotationStyle(title, subtitle);
      const annotation = new mk.MarkerAnnotation(
        coord,
        withMapPlaceClustering(markerOptions, clusteringId)
      );

      const handleSelect = () => {
        focusSavedPlaceRef.current(entry.place);
      };
      const wrapper = { annotation, place: entry.place, onSelect: handleSelect };
      annotation.addEventListener?.("select", handleSelect);

      try {
        map.addAnnotation(annotation);
      } catch {
        // ignore — failure here is non-fatal; the user can still use the drawer
      }
      next.set(entry.place.id, wrapper);
    }

    savedAnnotationsRef.current = next;
    syncMapMarkerClustering();
    return () => {
      for (const value of next.values()) {
        try {
          value.annotation.removeEventListener?.("select", value.onSelect);
        } catch {
          // ignore
        }
      }
    };
  }, [
    status,
    savedPlaceEntries,
    mapReadyTick,
    homeLabel,
    workLabel,
    clusteringIdForCurrentMapRegion,
    syncMapMarkerClustering,
  ]);

  // Drop all saved-place annotations when the map tears down so a re-open
  // starts from a clean slate (the next sync effect re-creates them).
  useEffect(() => {
    if (isWindowOpen) return;
    savedAnnotationsRef.current = new Map();
  }, [isWindowOpen]);

  // Suppress the temporary red search pin when the currently-selected place
  // already has its own permanent saved annotation. Otherwise we'd render
  // two markers stacked at the same coordinate.
  const isPlaceSaved = useCallback(
    (id: string | undefined): boolean => {
      if (!id) return false;
      if (homePlace?.id === id) return true;
      if (workPlace?.id === id) return true;
      return favoritePlaces.some((p) => p.id === id);
    },
    [homePlace, workPlace, favoritePlaces]
  );
  useEffect(() => {
    isPlaceSavedRef.current = isPlaceSaved;
  }, [isPlaceSaved]);

  // When a search result becomes a saved place (e.g. user just hit "Set as
  // Home"), drop the temporary search pin so the new persistent annotation
  // is the only marker shown.
  useEffect(() => {
    if (!annotationRef.current) return;
    if (!selectedResultId) return;
    if (!isPlaceSaved(selectedResultId)) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      map.removeAnnotation(annotationRef.current);
    } catch {
      // ignore
    }
    annotationRef.current = null;
    dispatchUi({ type: "setSelectedResultId", id: null });
  }, [selectedResultId, isPlaceSaved]);

  // On first map ready, frame the viewport so the user immediately sees
  // a useful, city-level region. Priority order:
  //   1. Persisted `selectedPlace` — re-drop / re-center on the open card
  //   2. The user's current location, but only when geolocation
  //      permission has already been granted in a previous session. We
  //      deliberately avoid triggering a permission prompt on map open;
  //      the dedicated "Locate Me" button is the right place for that.
  //   3. The user's saved Home — city-level zoom around it
  //   4. Otherwise, leave the map at the SF default region
  // Guarded so it only fires once per live MapKit map (including after the
  // surface remounts from minimize): subsequent user-driven selections go
  // through `dropPinAt` / `focusSavedPlace` directly.
  useEffect(() => {
    if (hasHydratedSelectedRef.current) return;
    if (status !== "ready") return;
    const mk = getMapKit();
    const map = mapInstanceRef.current;
    if (!mk || !map) return;

    // Centering on the persisted selected place wins over everything
    // else — the user explicitly had this card open last session.
    if (selectedPlace) {
      hasHydratedSelectedRef.current = true;
      lastFocusedPlaceIdRef.current = selectedPlace.id;
      if (isPlaceSaved(selectedPlace.id)) {
        const coord = new mk.Coordinate(
          selectedPlace.latitude,
          selectedPlace.longitude
        );
        const span = new mk.CoordinateSpan(
          FOCUS_PLACE_SPAN_DEG,
          FOCUS_PLACE_SPAN_DEG
        );
        const region = new mk.CoordinateRegion(coord, span);
        map.setRegionAnimated(region, true);
      } else {
        dropPinAt(selectedPlace);
      }
      return;
    }

    // From here on the framing depends on either an async geolocation
    // read or the user's saved Home. Mark hydrated immediately so an
    // unrelated re-render (e.g. saved places hydrating later) doesn't
    // re-run this effect and double-animate the map.
    hasHydratedSelectedRef.current = true;

    let cancelled = false;

    const frameAtCityLevel = (latitude: number, longitude: number) => {
      if (cancelled) return;
      const center = new mk.Coordinate(latitude, longitude);
      const span = new mk.CoordinateSpan(
        CITY_LEVEL_SPAN_DEG,
        CITY_LEVEL_SPAN_DEG
      );
      const region = new mk.CoordinateRegion(center, span);
      map.setRegionAnimated(region, true);
    };

    const frameAtHomeOrSkip = () => {
      if (cancelled) return;
      // Read the latest persisted home directly from the store rather
      // than the captured closure value — the persist hydration can land
      // a moment after this effect first runs, so we want the freshest
      // value at the time the async permission probe resolves.
      const home = useMapsStore.getState().home;
      if (home) {
        frameAtCityLevel(home.latitude, home.longitude);
      }
      // No home set — leave the map at its SF default region.
    };

    const tryUseCurrentLocation = (): boolean => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        return false;
      }
      let resolved = false;
      const timer = window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        frameAtHomeOrSkip();
      }, INITIAL_LOCATION_TIMEOUT_MS);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (resolved) return;
          resolved = true;
          window.clearTimeout(timer);
          frameAtCityLevel(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          if (resolved) return;
          resolved = true;
          window.clearTimeout(timer);
          frameAtHomeOrSkip();
        },
        { timeout: INITIAL_LOCATION_TIMEOUT_MS, maximumAge: 5 * 60 * 1000 }
      );
      return true;
    };

    // Probe the Permissions API first so we only call `getCurrentPosition`
    // when the user has already granted access in a previous session.
    // Browsers without `permissions.query` (older Safari) fall back to
    // home framing; the explicit "Locate Me" button still works there.
    const permissions = (
      typeof navigator !== "undefined"
        ? (navigator as Navigator & {
            permissions?: {
              query: (
                descriptor: PermissionDescriptor
              ) => Promise<PermissionStatus>;
            };
          }).permissions
        : undefined
    );

    if (permissions?.query) {
      permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          if (cancelled) return;
          if (result.state === "granted") {
            if (!tryUseCurrentLocation()) {
              frameAtHomeOrSkip();
            }
            return;
          }
          frameAtHomeOrSkip();
        })
        .catch(() => {
          if (cancelled) return;
          frameAtHomeOrSkip();
        });
    } else {
      frameAtHomeOrSkip();
    }

    return () => {
      cancelled = true;
    };
    // Same reasoning as the saved-annotations effect: depend on
    // `mapReadyTick` so framing fires the moment the map instance is
    // (re)created, not whenever some unrelated render happens to flush.
    // We intentionally do NOT depend on `homePlace` here — the framing
    // only runs once (guarded by `hasHydratedSelectedRef`) and we read
    // the latest home directly from the store inside the async branch.
  }, [status, selectedPlace, dropPinAt, isPlaceSaved, mapReadyTick]);

  // After the initial hydration framing has run, react to external changes
  // to `selectedPlace` (e.g. from a chat tool card tap). We track the last
  // place we focused so simultaneous in-app actions (search-result tap,
  // saved-place tap) don't double-frame on the same coordinate.
  useEffect(() => {
    if (!hasHydratedSelectedRef.current) return;
    if (status !== "ready") return;
    if (!selectedPlace) {
      lastFocusedPlaceIdRef.current = null;
      return;
    }
    if (lastFocusedPlaceIdRef.current === selectedPlace.id) return;

    lastFocusedPlaceIdRef.current = selectedPlace.id;
    const mk = getMapKit();
    const map = mapInstanceRef.current;
    if (!mk || !map) return;

    if (isPlaceSaved(selectedPlace.id)) {
      const coord = new mk.Coordinate(
        selectedPlace.latitude,
        selectedPlace.longitude
      );
      const span = new mk.CoordinateSpan(
        FOCUS_PLACE_SPAN_DEG,
        FOCUS_PLACE_SPAN_DEG
      );
      const region = new mk.CoordinateRegion(coord, span);
      map.setRegionAnimated(region, true);
    } else {
      dropPinAt(selectedPlace);
    }
  }, [selectedPlace, status, isPlaceSaved, dropPinAt, mapReadyTick]);

  const adjustMapZoom = useCallback((direction: "in" | "out") => {
    const mk = getMapKit();
    const map = mapInstanceRef.current;
    if (!mk || !map) return;
    const current = readMapRegion(map.region);
    if (!current) return;
    const factor =
      direction === "in" ? MAP_ZOOM_STEP_FACTOR : 1 / MAP_ZOOM_STEP_FACTOR;
    const latitudeDelta = clampMapSpanDegrees(
      current.span.latitudeDelta * factor
    );
    const longitudeDelta = clampMapSpanDegrees(
      current.span.longitudeDelta * factor
    );
    const center = new mk.Coordinate(
      current.center.latitude,
      current.center.longitude
    );
    const span = new mk.CoordinateSpan(latitudeDelta, longitudeDelta);
    const region = new mk.CoordinateRegion(center, span);
    map.setRegionAnimated(region, true);
  }, []);

  const handleZoomIn = useCallback(() => adjustMapZoom("in"), [adjustMapZoom]);
  const handleZoomOut = useCallback(() => adjustMapZoom("out"), [adjustMapZoom]);

  const handleLocateMe = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.showsUserLocation = true;
    map.tracksUserLocation = true;
  }, []);

  // Debounced search-as-you-type. Fires `performSearch` after the user pauses
  // for ~250ms. Pressing Enter still triggers immediately via handleSearchKeyDown
  // — performSearch's request-token guard ensures the latest call wins.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      // Bump request id so any in-flight callback is ignored once it returns.
      searchRequestIdRef.current += 1;
      dispatchUi({ type: "searchReset" });
      return;
    }
    if (status !== "ready") return;
    if (trimmed.length < 2) return; // skip noise on a single character

    const handle = window.setTimeout(() => {
      performSearch(trimmed);
    }, 250);
    return () => {
      window.clearTimeout(handle);
    };
  }, [searchQuery, status, performSearch]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        performSearch(searchQuery);
      } else if (e.key === "Escape") {
        dispatchUi({ type: "setShowingResults", isShowingResults: false });
      }
    },
    [performSearch, searchQuery]
  );

  const canUseMap = status === "ready";

  useEffect(() => {
    if (status !== "loading") {
      dispatchUi({ type: "setShowLoadingOverlay", show: false });
      return;
    }
    const id = window.setTimeout(() => {
      dispatchUi({ type: "setShowLoadingOverlay", show: true });
    }, LOADING_OVERLAY_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [status]);

  const overlayMessage = useMemo(() => {
    if (status === "ready") return null;
    if (status === "loading" && !showLoadingOverlay) return null;
    return t(statusMessageKey(status), {
      defaultValue:
        status === "missing-token"
          ? "Apple Maps isn't configured yet. Ask the developer to add MapKit credentials."
          : status === "loading"
            ? "Loading Apple Maps…"
            : status === "error"
              ? error || "Failed to load Apple Maps."
              : "Apple Maps is initializing…",
      error: error ?? "",
    });
  }, [status, t, error, showLoadingOverlay]);

  return {
    t,
    translatedHelpItems,
    isWindowsTheme,
    isMacOSTheme,
    isDarkMode,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    mapType,
    setMapType,
    status,
    error,
    hasToken,
    attachMapSurfaceRef,
    searchQuery,
    searchResults,
    isSearching,
    searchError,
    selectedResultId,
    isShowingResults,
    isPlacesDrawerOpen,
    dispatchUi,
    homePlace,
    workPlace,
    favoritePlaces,
    recentPlaces,
    selectedPlace,
    setHomePlace,
    setWorkPlace,
    handleSelectResult,
    handleSelectSavedPlace,
    handleToggleFavorite,
    handleOpenPlaceDirections,
    handleClosePlaceCard,
    isPlaceFavorite,
    handleZoomIn,
    handleZoomOut,
    handleLocateMe,
    handleSearchKeyDown,
    canUseMap,
    overlayMessage,
  };
}
