import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "@phosphor-icons/react";
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
import {
  FAVORITE_GLYPH_IMAGE,
  HOME_GLYPH_IMAGE,
  WORK_GLYPH_IMAGE,
} from "../utils/markerGlyphs";

// Minimal MapKit JS shape we touch from this component. We only declare the
// fields we use so we don't need the full @types/apple-mapkit-js-browser
// package — the cdn-loaded `mapkit` global supplies the real implementation.
interface MapKitCoordinate {
  latitude: number;
  longitude: number;
}

interface MapKitSearchResultItem {
  coordinate: MapKitCoordinate;
  name?: string;
  formattedAddress?: string;
  region?: unknown;
  pointOfInterestCategory?: string;
}

interface MapKitSearchResponse {
  places?: MapKitSearchResultItem[];
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
    options?: { region?: unknown }
  ) => void;
}

interface MapKitAnnotationEvent {
  target: MapKitMarkerAnnotation;
}

interface MapKitMarkerAnnotation {
  coordinate: MapKitCoordinate;
  data?: unknown;
  addEventListener?: (
    type: string,
    listener: (event: MapKitAnnotationEvent) => void
  ) => void;
  removeEventListener?: (
    type: string,
    listener: (event: MapKitAnnotationEvent) => void
  ) => void;
}

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
}

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
      showsCompass: "adaptive",
      showsScale: "adaptive",
      showsUserLocationControl: true,
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
              id: `${p.coordinate.latitude},${p.coordinate.longitude},${index}`,
              name: p.name || p.formattedAddress || trimmed,
              subtitle: p.formattedAddress || "",
              coordinate: p.coordinate,
              category: p.pointOfInterestCategory,
            }));
          setSearchResults(mapped);
        },
        region ? { region } : undefined
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
    }) => {
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (!mk || !map) return;

      // If the place already has a permanent saved annotation, skip the
      // red search pin entirely and just frame it. This keeps clicks on
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
        const annotation = new mk.MarkerAnnotation(coord, {
          title: place.name,
          subtitle: place.subtitle ?? "",
          color: "#E25B4F",
        });
        map.addAnnotation(annotation);
        annotationRef.current = annotation;
      } else {
        setSelectedResultId(null);
      }

      const span = new mk.CoordinateSpan(0.05, 0.05);
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
      });

      const saved: SavedPlace = {
        id: result.id,
        name: result.name,
        subtitle: result.subtitle,
        latitude: result.coordinate.latitude,
        longitude: result.coordinate.longitude,
        category: result.category,
      };
      recordRecentPlace(saved);
      setSelectedPlace(saved);
    },
    [dropPinAt, recordRecentPlace, setSelectedPlace]
  );

  // Center + record recent for a saved place. We deliberately do NOT call
  // `dropPinAt` here because Home / Work / Favorites already have their own
  // permanent annotations on the map — adding a red search-pin on top would
  // duplicate the marker. The place card opens via `setSelectedPlace`.
  const focusSavedPlace = useCallback(
    (place: SavedPlace) => {
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (mk && map) {
        const coord = new mk.Coordinate(place.latitude, place.longitude);
        const span = new mk.CoordinateSpan(0.05, 0.05);
        const region = new mk.CoordinateRegion(coord, span);
        map.setRegionAnimated(region, true);
      }
      // Also clear any leftover search pin so the saved annotation is the
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

  // Build the diff key for the saved-annotations layer. We include the
  // category (so a marker visually moves between Home/Work/Favorite without
  // a stale icon lingering) and the coordinate (so editing a saved place to
  // a new location re-creates the annotation rather than leaving the pin
  // stranded at the old spot).
  const savedPlaceEntries = useMemo<
    Array<{ key: string; kind: "home" | "work" | "favorite"; place: SavedPlace }>
  >(() => {
    const entries: Array<{
      key: string;
      kind: "home" | "work" | "favorite";
      place: SavedPlace;
    }> = [];
    const seen = new Set<string>();
    if (homePlace) {
      const key = `home:${homePlace.id}:${homePlace.latitude},${homePlace.longitude}`;
      entries.push({ key, kind: "home", place: homePlace });
      seen.add(homePlace.id);
    }
    if (workPlace && !seen.has(workPlace.id)) {
      const key = `work:${workPlace.id}:${workPlace.latitude},${workPlace.longitude}`;
      entries.push({ key, kind: "work", place: workPlace });
      seen.add(workPlace.id);
    }
    for (const fav of favoritePlaces) {
      // Don't double-render a favorite that's also Home or Work — the
      // dedicated Home/Work annotation already covers that location and a
      // second star pin on top would be visual noise.
      if (seen.has(fav.id)) continue;
      const key = `favorite:${fav.id}:${fav.latitude},${fav.longitude}`;
      entries.push({ key, kind: "favorite", place: fav });
      seen.add(fav.id);
    }
    return entries;
  }, [homePlace, workPlace, favoritePlaces]);

  // Sync Home / Work / Favorites annotations on the map. Each saved kind
  // gets a distinct pin color — Home blue, Work amber, Favorites gold —
  // matching the drawer/place-card visual language, but we keep the marker
  // free of glyphs so the map stays uncluttered. We diff by key so
  // unchanged pins stay put (no flicker, no MapKit re-allocation) while
  // additions / removals happen incrementally. The click handler stored on
  // each annotation reads from `focusSavedPlaceRef`, so the listener stays
  // valid for the lifetime of the annotation.
  useEffect(() => {
    if (status !== "ready") return;
    const mk = getMapKit();
    const map = mapInstanceRef.current;
    if (!mk || !map) return;

    const prev = savedAnnotationsRef.current;
    const next = new Map<
      string,
      { annotation: MapKitMarkerAnnotation; place: SavedPlace }
    >();

    const desiredKeys = new Set(savedPlaceEntries.map((e) => e.key));

    // Remove annotations that no longer correspond to a saved place.
    for (const [key, value] of prev.entries()) {
      if (!desiredKeys.has(key)) {
        try {
          map.removeAnnotation(value.annotation);
        } catch {
          // ignore — mapkit may have already detached
        }
      }
    }

    for (const entry of savedPlaceEntries) {
      const existing = prev.get(entry.key);
      if (existing) {
        // Keep the existing annotation but refresh the place data the
        // click listener will use (e.g. updated subtitle from a re-search).
        existing.place = entry.place;
        next.set(entry.key, existing);
        continue;
      }

      const coord = new mk.Coordinate(
        entry.place.latitude,
        entry.place.longitude
      );
      // Per-kind marker color + Phosphor-derived glyph image. The glyph
      // hash is the same `data:` SVG for all three densities — Apple's
      // docs require ≥ 20×20 with 40×40 recommended; SVG scales for all.
      const visual =
        entry.kind === "home"
          ? { color: "#1d4ed8", glyph: HOME_GLYPH_IMAGE }
          : entry.kind === "work"
            ? { color: "#b45309", glyph: WORK_GLYPH_IMAGE }
            : { color: "#f59e0b", glyph: FAVORITE_GLYPH_IMAGE };
      const annotation = new mk.MarkerAnnotation(coord, {
        title: entry.place.name,
        subtitle: entry.place.subtitle ?? "",
        color: visual.color,
        glyphColor: "#ffffff",
        glyphImage: visual.glyph,
        // Use the same glyph when selected so the icon doesn't flash to
        // the default pin glyph during the expanded callout state.
        selectedGlyphImage: visual.glyph,
        // Above default search pins so a search result doesn't visually
        // hide a saved annotation at the same location.
        displayPriority: 1000,
        selected: false,
      });

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
      next.set(entry.key, wrapper);
    }

    savedAnnotationsRef.current = next;
  }, [status, savedPlaceEntries]);

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

  // Re-drop the pin and re-center on the persisted `selectedPlace` once the
  // map becomes ready. Guarded so it only fires once per mount: subsequent
  // user-driven selections go through `dropPinAt` directly.
  const hasHydratedSelectedRef = useRef(false);
  useEffect(() => {
    if (hasHydratedSelectedRef.current) return;
    if (status !== "ready") return;
    if (!mapInstanceRef.current) return;
    if (!selectedPlace) {
      // Mark as hydrated so we don't accidentally re-drop a pin if the user
      // closes the card before the map finishes loading and then re-opens it.
      hasHydratedSelectedRef.current = true;
      return;
    }
    hasHydratedSelectedRef.current = true;
    if (isPlaceSaved(selectedPlace.id)) {
      // The saved-annotations sync effect already places (or will place) a
      // permanent pin for this place — just center the map so the pin and
      // info card line up without stacking a duplicate red marker on top.
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (mk && map) {
        const coord = new mk.Coordinate(
          selectedPlace.latitude,
          selectedPlace.longitude
        );
        const span = new mk.CoordinateSpan(0.05, 0.05);
        const region = new mk.CoordinateRegion(coord, span);
        map.setRegionAnimated(region, true);
      }
      return;
    }
    dropPinAt(selectedPlace);
  }, [status, selectedPlace, dropPinAt, isPlaceSaved]);

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

  const overlayMessage = useMemo(() => {
    if (status === "ready") return null;
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
  }, [status, t, error]);

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.maps.title", { defaultValue: "Maps" })}
        onClose={onClose}
        isForeground={isForeground}
        appId="maps"
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
        <div className="flex flex-1 min-w-0 flex-col h-full w-full bg-os-window-bg font-os-ui">
          {/* Search bar */}
          <div
            className={cn(
              "flex items-center gap-2 py-1.5 pl-1.5 pr-1.5 border-b",
              isMacOSTheme
                ? "border-black/30 bg-[linear-gradient(to_bottom,#f3f3f3,#d6d6d6)]"
                : "border-black/40 bg-os-window-bg"
            )}
          >
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
              className="flex-1 min-w-0"
            />
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

          {/* Map area + results overlay */}
          <div className="relative flex-1 min-h-0 overflow-hidden">
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
                  "absolute inset-0 flex items-center justify-center px-6 text-center",
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

            {isShowingResults && (
              <div
                className={cn(
                  "absolute inset-x-0 top-0 max-h-[60%] overflow-y-auto",
                  "border-b shadow-md",
                  "bg-white/95 backdrop-blur-sm",
                  isMacOSTheme ? "border-black/30" : "border-black/40"
                )}
              >
                {isSearching && (
                  <div className="px-3 py-2 text-[11px] text-black/60">
                    {t("apps.maps.searching", {
                      defaultValue: "Searching…",
                    })}
                  </div>
                )}
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
                {!isSearching && searchResults.length > 0 && (
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
