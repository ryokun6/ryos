import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import type { AppProps } from "@/apps/base/types";
import { appMetadata } from "..";
import { MapsMenuBar } from "./MapsMenuBar";
import { useMapsLogic, type MapsMapType } from "../hooks/useMapsLogic";
import { useMapKit, type MapKitStatus } from "../hooks/useMapKit";

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

interface MapKitMarkerAnnotation {
  coordinate: MapKitCoordinate;
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

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapsSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [isShowingResults, setIsShowingResults] = useState(false);

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

      setIsSearching(true);
      setSearchError(null);
      setIsShowingResults(true);

      const search = new mk.Search({ getsUserLocation: true });
      search.search(trimmed, (err, data) => {
        setIsSearching(false);
        if (err) {
          setSearchResults([]);
          setSearchError(err.message || "Search failed");
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
          }));
        setSearchResults(mapped);
      });
    },
    [status]
  );

  const handleSelectResult = useCallback(
    (result: MapsSearchResult) => {
      const mk = getMapKit();
      const map = mapInstanceRef.current;
      if (!mk || !map) return;

      setSelectedResultId(result.id);
      setIsShowingResults(false);

      if (annotationRef.current) {
        try {
          map.removeAnnotation(annotationRef.current);
        } catch {
          // ignore
        }
        annotationRef.current = null;
      }

      const coord = new mk.Coordinate(
        result.coordinate.latitude,
        result.coordinate.longitude
      );
      const annotation = new mk.MarkerAnnotation(coord, {
        title: result.name,
        subtitle: result.subtitle,
        color: "#E25B4F",
      });
      map.addAnnotation(annotation);
      annotationRef.current = annotation;

      const span = new mk.CoordinateSpan(0.05, 0.05);
      const region = new mk.CoordinateRegion(coord, span);
      map.setRegionAnimated(region, true);
    },
    []
  );

  const handleLocateMe = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.showsUserLocation = true;
    map.tracksUserLocation = true;
  }, []);

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
                      return (
                        <li key={result.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectResult(result)}
                            className={cn(
                              "w-full text-left px-3 py-2 text-[12px]",
                              "hover:bg-black/5",
                              isSelected && "bg-black/5"
                            )}
                          >
                            <div className="font-medium text-black truncate">
                              {result.name}
                            </div>
                            {result.subtitle && (
                              <div className="text-[11px] text-black/55 truncate">
                                {result.subtitle}
                              </div>
                            )}
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
