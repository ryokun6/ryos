import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, NavigationArrow } from "@phosphor-icons/react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import type { AppProps } from "@/apps/base/types";
import { appMetadata } from "..";
import { MapsMenuBar } from "./MapsMenuBar";
import { useMapsLogic, type MapsMapType } from "../hooks/useMapsLogic";
import { useMapKit, type MapKitStatus } from "../hooks/useMapKit";
import { getPoiVisual, poiVisualGradient } from "../utils/poiVisuals";
import { MapsPlacesDrawer } from "./MapsPlacesDrawer";
import { MapsPlaceCard } from "./MapsPlaceCard";
import { useMapsStore } from "@/stores/useMapsStore";
import type { SavedPlace } from "../utils/types";
import { getPoiMarkerAnnotationOptions } from "../utils/poiMarkerStyle";
import {
  homeMarkerAnnotationStyle,
  workMarkerAnnotationStyle,
} from "../utils/savedPlaceVisuals";

// Minimal MapKit JS shape we touch from this component. We only declare the
// fields we use so we don't need the full @types/apple-mapkit-js-browser
// package — the cdn-loaded `mapkit` global supplies the real implementation.
interface MapKitCoordinate {
  latitude: number;
  longitude: number;
}

// `MapKitPlace` mirrors the subset of `mapkit.Place` (introduced in
// MapKit JS 5.78) that we touch. Search responses now return Place
// instances with a stable `id` (Apple's Place ID) plus the address
// components we already used (name / formattedAddress / category). We
// keep the type loose so older MapKit JS versions, where `id` is absent,
// still type-check at the call site.
//   https://developer.apple.com/documentation/mapkitjs/place
interface MapKitPlace {
  coordinate: MapKitCoordinate;
  name?: string;
  formattedAddress?: string;
  region?: unknown;
  pointOfInterestCategory?: string;
  id?: string;
  alternateIds?: string[];
}

interface MapKitSearchResponse {
  places?: MapKitPlace[];
}

interface MapKitMapInstance {
  showsUserLocation: boolean;
  tracksUserLocation: boolean;
  mapType: string;
  region: unknown;
  setRegionAnimated: (region: unknown, animated?: boolean) => void;
  setCenterAnimated: (
    center: MapKitCoordinate,
    animated?: boolean
  ) => void;
  addAnnotation: (annotation: unknown) => void;
  removeAnnotation: (annotation: unknown) => void;
  destroy: () => void;
}

interface MapKitSearchInstance {
  search: (
    query: string,
    callback: (error: Error | null, data: MapKitSearchResponse) => void,
    options?: {
      region?: unknown;
      /**
       * MapKit JS 5.78+ — when set to "required", the search is strictly
       * confined to the supplied region. Default behavior allows
       * out-of-region hits when nothing local matches.
       */
      regionPriority?: MapKitRegionPriority;
    }
  ) => void;
}

interface MapKitAnnotationEvent {
  target: MapKitMarkerAnnotation;
}

interface MapKitMarkerAnnotation {
  coordinate: MapKitCoordinate;
  data?: unknown;
  /** Writable. When true MapKit shows the annotation's callout. */
  selected?: boolean;
  addEventListener?: (
    type: string,
    listener: (event: MapKitAnnotationEvent) => void
  ) => void;
  removeEventListener?: (
    type: string,
    listener: (event: MapKitAnnotationEvent) => void
  ) => void;
}

// `RegionPriority` was introduced in MapKit JS 5.78 alongside the strict
// region search filtering. We treat the enum as a string union since the
// runtime values ("default", "required") are stable.
//   https://developer.apple.com/documentation/mapkitjs/regionpriority
type MapKitRegionPriority = "default" | "required";

interface MapKitGlobal {
  Map: new (
    element: HTMLElement,
    options?: Record<string, unknown>
  ) => MapKitMapInstance;
  Coordinate: new (latitude: number, longitude: number) => MapKitCoordinate;
  CoordinateRegion: new (center: MapKitCoordinate, span: unknown) => unknown;
  CoordinateSpan: new (
    latitudeDelta: number,
    longitudeDelta: number
  ) => unknown;
  MarkerAnnotation: new (
    coordinate: MapKitCoordinate,
    options?: Record<string, unknown>
  ) => MapKitMarkerAnnotation;
  // Optional in the type so loaders that don't expose the constant still
  // typecheck. We default to "default" / "required" string literals.
  RegionPriority?: { Default: MapKitRegionPriority; Required: MapKitRegionPriority };
  Search: new (options?: Record<string, unknown>) => {
    search: (
      query: string,
      callback: (error: Error | null, data: MapKitSearchResponse) => void
    ) => void;
  };
}

function getMapKit(): MapKitGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { mapkit?: MapKitGlobal }).mapkit ?? null;
}

// MapKit JS accepts these as plain strings on `map.mapType`. Using literals
// avoids the `mapkit.Map.MapTypes` enum lookup which (a) lives under
// `mapkit.Map`, not the top-level `mapkit`, and (b) isn't guaranteed to be
// populated immediately after `mapkit.init()`.
function mapTypeToMapKit(type: MapsMapType): string {
  switch (type) {
    case "hybrid":
      return "hybrid";
    case "satellite":
      return "satellite";
    case "mutedStandard":
      return "mutedStandard";
    case "standard":
    default:
      return "standard";
  }
}

interface MapsSearchResult {
  id: string;
  name: string;
  subtitle: string;
  coordinate: MapKitCoordinate;
  category?: string;
  /**
   * Apple Place ID (MapKit JS 5.78+). Persisted onto saved places so we
   * fields go stale or for future server-side refresh.
   */
  placeId?: string;
  /**
   * Raw `Place` reference returned by MapKit. Passed to `MarkerAnnotation`
   * as `place` so MapKit can hide the underlying POI tile at this coordinate.
   */
  place?: MapKitPlace;
}

// Coordinate-degree span used when focusing on a single place (search hit,
// saved-place tap, persisted selection re-center). ~0.012° ≈ 1.3 km wide
// at the equator — neighborhood / street level — which mirrors how the
// system Maps app zooms when you tap a result. The previous value (0.05)
// stayed at region level and made it hard to see surrounding streets.
const FOCUS_PLACE_SPAN_DEG = 0.012;

function statusMessageKey(status: MapKitStatus): string {
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

export function MapsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    isXpTheme,
    isMacOSTheme,
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
    Map<string, { annotation: MapKitMarkerAnnotation; place: SavedPlace }>
  >(new Map());
  // Bump every time the underlying MapKit instance is (re)created so any
  // effect that wants to act on `mapInstanceRef.current` can subscribe via
  // a real React dep — refs alone don't trigger re-renders, which made
  // the saved-annotations sync silently miss the first map-ready window
  // when status flipped to "ready" mid-render.
  const [mapReadyTick, setMapReadyTick] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapsSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [isShowingResults, setIsShowingResults] = useState(false);
  const [isPlacesDrawerOpen, setIsPlacesDrawerOpen] = useState(false);

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

  // Initialize the map instance once mapkit is ready and the window is open.
  useEffect(() => {
    if (!isWindowOpen) return;
    if (status !== "ready") return;
    const mk = getMapKit();
    if (!mk) return;
    if (mapInstanceRef.current) return;
    if (!mapContainerRef.current) return;

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

    const map = new mk.Map(mapContainerRef.current, {
      showsZoomControl: true,
      showsCompass: "hidden",
      showsScale: "adaptive",
      showsMapTypeControl: false,
      showsUserLocationControl: false,
      isRotationEnabled: true,
      // Show all points of interest by default. `null` is MapKit's "no
      // filter" sentinel which means every POI category is rendered.
      pointOfInterestFilter: null,
      region,
    });
    map.mapType = mapTypeToMapKit(mapType);
    map.showsUserLocation = false;
    map.tracksUserLocation = false;
    mapInstanceRef.current = map;
    // Notify dependents (saved-annotations sync, hydration framing, etc.)
    // that the underlying map instance is ready. Bumping a counter forces
    // a re-render so effects that read `mapInstanceRef.current` actually
    // see the new value instead of skipping it on a stale closure.
    setMapReadyTick((tick) => tick + 1);
    // We intentionally do NOT depend on mapType here — the next effect
    // syncs it whenever the user picks a different option.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWindowOpen, status]);

  // Sync map type when the user changes it via the View menu.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.mapType = mapTypeToMapKit(mapType);
  }, [mapType]);

  // Tear down the map instance when the window closes or the component
  // unmounts so repeated open/close cycles don't leak DOM nodes.
  useEffect(() => {
    if (isWindowOpen) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      map.destroy();
    } catch {
      // ignore — mapkit may have already cleaned up
    }
    mapInstanceRef.current = null;
    annotationRef.current = null;
    // Reset the readiness counter so the next time the window opens the
    // saved-annotations sync re-runs against the freshly-created map.
    setMapReadyTick(0);
  }, [isWindowOpen]);

  useEffect(() => {
    return () => {
      const map = mapInstanceRef.current;
      if (map) {
        try {
          map.destroy();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
        annotationRef.current = null;
      }
    };
  }, []);

  const performSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setSearchResults([]);
        setSearchError(null);
        setIsShowingResults(false);
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
      setIsSearching(true);
      setSearchError(null);
      setIsShowingResults(true);

      search.search(
        trimmed,
        (err, data) => {
          // Ignore stale callbacks (user typed and re-searched in the
          // meantime). MapKit doesn't expose a cancel API, so we discard.
          if (requestId !== searchRequestIdRef.current) return;

          setIsSearching(false);
          if (err) {
            setSearchResults([]);
            setSearchError(
              err.message ||
                t("apps.maps.searchFailed", { defaultValue: "Search failed" })
            );
            return;
          }
          const places = data?.places ?? [];
          const mapped: MapsSearchResult[] = places
            .filter((p) => p && p.coordinate)
            .map((p, index) => ({
              // Prefer Apple's stable Place ID (5.78+) when available so
              // re-selecting the same result across sessions / search
              // refreshes hits the same `SavedPlace` entry. Falls back to
              // the coordinate-based composite for older MapKit JS.
              id:
                p.id ||
                `${p.coordinate.latitude},${p.coordinate.longitude},${index}`,
              name: p.name || p.formattedAddress || trimmed,
              subtitle: p.formattedAddress || "",
              coordinate: p.coordinate,
              category: p.pointOfInterestCategory,
              placeId: p.id,
              place: p,
            }));
          setSearchResults(mapped);
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
        setSelectedResultId(place.id);
        const annotation = new mk.MarkerAnnotation(
          coord,
          getPoiMarkerAnnotationOptions(
            place.name,
            place.subtitle ?? "",
            place.category,
            {
              ...(place.mapKitPlace ? { place: place.mapKitPlace } : {}),
            }
          )
        );
        map.addAnnotation(annotation);
        annotationRef.current = annotation;
      } else {
        setSelectedResultId(null);
      }

      const span = new mk.CoordinateSpan(
        FOCUS_PLACE_SPAN_DEG,
        FOCUS_PLACE_SPAN_DEG
      );
      const region = new mk.CoordinateRegion(coord, span);
      map.setRegionAnimated(region, true);
    },
    []
  );

  const handleSelectResult = useCallback(
    (result: MapsSearchResult) => {
      setIsShowingResults(false);
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
        setSelectedResultId(null);
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
    setSelectedResultId(null);
  }, []);

  const handleClosePlaceCard = useCallback(() => {
    setSelectedPlace(null);
    clearDroppedAnnotation();
  }, [setSelectedPlace, clearDroppedAnnotation]);

  const handleToggleFavorite = useCallback(
    (place: SavedPlace) => {
      if (isPlaceFavorite(place.id)) {
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
        map.removeAnnotation(value.annotation);
      } catch {
        // ignore — mapkit may have already detached
      }
    }
    const next = new Map<
      string,
      { annotation: MapKitMarkerAnnotation; place: SavedPlace }
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

      const annotation = new mk.MarkerAnnotation(
        coord,
        entry.kind === "favorite"
          ? getPoiMarkerAnnotationOptions(title, subtitle, entry.place.category, {
              displayPriority: 1000,
              selected: false,
            })
          : entry.kind === "home"
            ? homeMarkerAnnotationStyle(title, subtitle)
            : workMarkerAnnotationStyle(title, subtitle)
      );

      const wrapper = { annotation, place: entry.place };
      const handleSelect = () => {
        focusSavedPlaceRef.current(wrapper.place);
      };
      annotation.addEventListener?.("select", handleSelect);

      try {
        map.addAnnotation(annotation);
      } catch {
        // ignore — failure here is non-fatal; the user can still use the drawer
      }
      next.set(entry.place.id, wrapper);
    }

    savedAnnotationsRef.current = next;
  }, [status, savedPlaceEntries, mapReadyTick, homeLabel, workLabel]);

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
    setSelectedResultId(null);
  }, [selectedResultId, isPlaceSaved]);

  // On first map ready, frame the viewport so the user immediately sees
  // their context. Priority order:
  //   1. Persisted `selectedPlace` — re-drop / re-center on the open card
  //   2. Any saved Home / Work / Favorites — fit them all into view so the
  //      pins are visible instead of being stranded off-screen at the SF
  //      default region the map booted with
  //   3. Otherwise, leave the map at the SF default
  // Guarded so it only fires once per mount: subsequent user-driven
  // selections go through `dropPinAt` / `focusSavedPlace` directly.
  const hasHydratedSelectedRef = useRef(false);
  useEffect(() => {
    if (hasHydratedSelectedRef.current) return;
    if (status !== "ready") return;
    const mk = getMapKit();
    const map = mapInstanceRef.current;
    if (!mk || !map) return;

    // Centering on the persisted selected place wins over fitting all
    // saved places — the user explicitly had this card open last session.
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

    // No selected place — fit the viewport to all saved annotations so the
    // pins land inside the visible region instead of staying parked off the
    // SF default. Single-place case zooms to a neighborhood span; multi-
    // place case computes a bounding region with 30% padding so the pins
    // don't touch the viewport edges.
    //
    // We deliberately do NOT flip `hasHydratedSelectedRef` when there are
    // no saved places yet — the persist hydration is async, so an empty
    // entries list on the first run could just mean "store still
    // hydrating". Leaving the flag false lets a subsequent re-run (after
    // hydration adds Home/Work/Favorites) actually frame the viewport.
    const savedCoords = savedPlaceEntries.map((e) => e.place);
    if (savedCoords.length === 0) {
      return;
    }
    hasHydratedSelectedRef.current = true;

    if (savedCoords.length === 1) {
      const only = savedCoords[0];
      const coord = new mk.Coordinate(only.latitude, only.longitude);
      const span = new mk.CoordinateSpan(
        FOCUS_PLACE_SPAN_DEG,
        FOCUS_PLACE_SPAN_DEG
      );
      const region = new mk.CoordinateRegion(coord, span);
      map.setRegionAnimated(region, true);
      return;
    }

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const place of savedCoords) {
      if (place.latitude < minLat) minLat = place.latitude;
      if (place.latitude > maxLat) maxLat = place.latitude;
      if (place.longitude < minLng) minLng = place.longitude;
      if (place.longitude > maxLng) maxLng = place.longitude;
    }
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    // Pad the span so the outermost pins sit comfortably inside the view
    // and clamp to a sensible minimum so two pins right next to each other
    // don't zoom in to street level.
    const PAD = 1.3;
    // Floor at the same span we use for single-place focus so pins that
    // happen to sit close together still land at street level rather than
    // forcing a wider zoom.
    const latDelta = Math.max((maxLat - minLat) * PAD, FOCUS_PLACE_SPAN_DEG);
    const lngDelta = Math.max((maxLng - minLng) * PAD, FOCUS_PLACE_SPAN_DEG);
    const center = new mk.Coordinate(centerLat, centerLng);
    const span = new mk.CoordinateSpan(latDelta, lngDelta);
    const region = new mk.CoordinateRegion(center, span);
    map.setRegionAnimated(region, true);
    // Same reasoning as the saved-annotations effect: depend on
    // `mapReadyTick` so framing fires the moment the map instance is
    // (re)created, not whenever some unrelated render happens to flush.
  }, [
    status,
    selectedPlace,
    savedPlaceEntries,
    dropPinAt,
    isPlaceSaved,
    mapReadyTick,
  ]);

  // After the initial hydration framing has run, react to external changes
  // to `selectedPlace` (e.g. from a chat tool card tap). We track the last
  // place we focused so simultaneous in-app actions (search-result tap,
  // saved-place tap) don't double-frame on the same coordinate.
  const lastFocusedPlaceIdRef = useRef<string | null>(null);
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
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      setIsShowingResults(false);
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
        setIsShowingResults(false);
      }
    },
    [performSearch, searchQuery]
  );

  const canUseMap = status === "ready";

  const menuBar = (
    <MapsMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onLocateMe={handleLocateMe}
      mapType={mapType}
      onSetMapType={setMapType}
      canUseMap={canUseMap}
    />
  );

  // MapKit usually loads in well under a second from cache, and a flash of
  // "Loading Apple Maps…" during that window is visually noisy. Defer the
  // loading overlay until we've actually been loading for `LOADING_OVERLAY_DELAY_MS`.
  // Error and missing-token states still render immediately.
  const LOADING_OVERLAY_DELAY_MS = 600;
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  useEffect(() => {
    if (status !== "loading") {
      setShowLoadingOverlay(false);
      return;
    }
    const id = window.setTimeout(() => {
      setShowLoadingOverlay(true);
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

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.maps.title", { defaultValue: "Maps" })}
        onClose={onClose}
        isForeground={isForeground}
        appId="maps"
        material="notitlebar"
        disableTitlebarAutoHide
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
        drawer={
          <MapsPlacesDrawer
            isOpen={isPlacesDrawerOpen}
            onClose={() => setIsPlacesDrawerOpen(false)}
            home={homePlace}
            work={workPlace}
            favorites={favoritePlaces}
            recents={recentPlaces}
            onSelectPlace={handleSelectSavedPlace}
            t={t}
          />
        }
      >
        <div className="relative h-full w-full min-h-0 flex-1 overflow-hidden bg-transparent font-os-ui">
          <div
            ref={mapContainerRef}
            className="absolute inset-0 bg-[#e5e3df]"
            role="application"
            aria-label={t("apps.maps.mapAriaLabel", {
              defaultValue: "Map",
            })}
          />

          {overlayMessage && (
            <div
              className={cn(
                "absolute inset-0 z-[5] flex items-center justify-center px-6 text-center",
                "bg-os-window-bg/90 backdrop-blur-sm",
                "font-os-ui text-[12px] text-black/70"
              )}
            >
              <div className="max-w-[360px] space-y-2">
                <div className="text-[14px] font-semibold text-black">
                  {t("apps.maps.title", { defaultValue: "Maps" })}
                </div>
                <div>{overlayMessage}</div>
                {!hasToken && (
                  <div className="text-[11px] text-black/60">
                    {t("apps.maps.status.tokenHint", {
                      defaultValue:
                        "The server signs short-lived MapKit tokens automatically once credentials are configured.",
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search + results — immersive chrome over the map (Karaoke-style notitlebar window) */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-20 flex max-h-[min(85%,100%)] min-h-0 flex-col gap-1.5 px-1.5 pb-1.5",
              // Clearance for macOS notitlebar auto-hide strip (h-6) + 4px breathing room.
              isMacOSTheme ? "pt-7.5" : "pt-2.5"
            )}
          >
            <div className="pointer-events-auto flex items-center gap-2 bg-transparent">
              <SearchInput
                value={searchQuery}
                onChange={(value) => {
                  setSearchQuery(value);
                  if (!value) {
                    setSearchResults([]);
                    setSearchError(null);
                    setIsShowingResults(false);
                  }
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={t("apps.maps.searchPlaceholder", {
                  defaultValue: "Search Maps",
                })}
                ariaLabel={t("apps.maps.searchPlaceholder", {
                  defaultValue: "Search Maps",
                })}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant={isMacOSTheme ? "aqua" : "retro"}
                size="sm"
                onClick={handleLocateMe}
                disabled={!canUseMap}
                title={t("apps.maps.menu.locateMe", {
                  defaultValue: "Locate Me",
                })}
                aria-label={t("apps.maps.menu.locateMe", {
                  defaultValue: "Locate Me",
                })}
                className="shrink-0 !h-6 !w-6 !min-w-0 !rounded-full !p-0"
              >
                <NavigationArrow size={12} weight="fill" />
              </Button>
              <Button
                type="button"
                variant={isMacOSTheme ? "aqua" : "retro"}
                size="sm"
                onClick={() => setIsPlacesDrawerOpen((v) => !v)}
                aria-pressed={isPlacesDrawerOpen}
                title={t("apps.maps.places.title", { defaultValue: "Places" })}
                className="shrink-0 !h-6 !w-6 !min-w-0 !rounded-full !p-0"
              >
                <MapPin size={12} weight="fill" />
              </Button>
            </div>

            {isShowingResults && (
              <div
                className={cn(
                  "pointer-events-auto min-h-0 overflow-y-auto rounded-[0.4rem] border shadow-md",
                  "max-h-[min(60vh,28rem)]",
                  isMacOSTheme
                    ? "maps-place-card-aqua border-black/20 text-black"
                    : "border-black/40 bg-white/95 backdrop-blur-sm"
                )}
              >
                {/*
                 * No "Searching…" row: while a search is in flight we
                 * keep showing the previous results (if any) so the
                 * dropdown doesn't flicker between "Searching…" and the
                 * real results. If there are no prior results yet, the
                 * dropdown is empty until the first hit lands.
                 */}
                {!isSearching && searchError && (
                  <div className="px-3 py-2 text-[11px] text-red-700">
                    {searchError}
                  </div>
                )}
                {!isSearching && !searchError && searchResults.length === 0 && (
                  <div className="px-3 py-2 text-[11px] text-black/60">
                    {t("apps.maps.noResults", {
                      defaultValue: "No results",
                    })}
                  </div>
                )}
                {searchResults.length > 0 && (
                  <ul className="divide-y divide-black/10">
                    {searchResults.map((result) => {
                      const isSelected = selectedResultId === result.id;
                      const visual = getPoiVisual(result.category);
                      const Icon = visual.Icon;
                      return (
                        <li key={result.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectResult(result)}
                            className={cn(
                              "flex w-full items-center gap-3 px-3 py-2 text-left text-[12px]",
                              "hover:bg-black/5",
                              isSelected && "bg-black/5"
                            )}
                          >
                            <div
                              className="aqua-icon-badge flex h-7 w-7 shrink-0 items-center justify-center text-white"
                              style={{
                                backgroundImage: poiVisualGradient(visual),
                              }}
                              aria-hidden="true"
                            >
                              <Icon size={17} weight="fill" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-black">
                                {result.name}
                              </div>
                              {result.subtitle && (
                                <div className="truncate text-[11px] text-black/55">
                                  {result.subtitle}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-0 z-10">
            <MapsPlaceCard
              place={selectedPlace}
              isFavorite={
                selectedPlace ? isPlaceFavorite(selectedPlace.id) : false
              }
              isHome={
                !!selectedPlace &&
                !!homePlace &&
                homePlace.id === selectedPlace.id
              }
              isWork={
                !!selectedPlace &&
                !!workPlace &&
                workPlace.id === selectedPlace.id
              }
              onSetHome={(p) => setHomePlace(p)}
              onSetWork={(p) => setWorkPlace(p)}
              onToggleFavorite={handleToggleFavorite}
              onClose={handleClosePlaceCard}
            />
          </div>
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="maps"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="maps"
      />
    </>
  );
}
