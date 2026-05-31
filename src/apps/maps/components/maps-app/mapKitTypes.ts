import type { MapsMapType } from "../../hooks/useMapsLogic";

// Minimal MapKit JS shape we touch from this component. We only declare the
// fields we use so we don't need the full @types/apple-mapkit-js-browser
// package — the cdn-loaded `mapkit` global supplies the real implementation.
export interface MapKitCoordinate {
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
export interface MapKitPlace {
  coordinate: MapKitCoordinate;
  name?: string;
  formattedAddress?: string;
  region?: unknown;
  pointOfInterestCategory?: string;
  id?: string;
  alternateIds?: string[];
}

export interface MapKitSearchResponse {
  places?: MapKitPlace[];
}

export interface MapKitClusterAnnotation {
  clusteringIdentifier?: string;
  memberAnnotations?: unknown[];
  title?: string;
  subtitle?: string;
}

export interface MapKitMapInstance {
  showsUserLocation: boolean;
  tracksUserLocation: boolean;
  mapType: string;
  /**
   * MapKit JS color scheme — accepts the string values from
   * `mapkit.Map.ColorSchemes` (`"light"` / `"dark"` / `"adaptive"`).
   * Only honored when `mapType` is `Standard` or `MutedStandard`;
   * Hybrid / Satellite ignore the value but accept assignments.
   *   https://developer.apple.com/documentation/mapkitjs/map/colorscheme
   */
  colorScheme: string;
  region: unknown;
  setRegionAnimated: (region: unknown, animated?: boolean) => void;
  setCenterAnimated: (
    center: MapKitCoordinate,
    animated?: boolean
  ) => void;
  addAnnotation: (annotation: unknown) => void;
  removeAnnotation: (annotation: unknown) => void;
  addEventListener?: (
    type: string,
    listener: () => void
  ) => void;
  removeEventListener?: (
    type: string,
    listener: () => void
  ) => void;
  annotationForCluster?: (
    cluster: MapKitClusterAnnotation
  ) => MapKitClusterAnnotation | void;
  destroy: () => void;
}

export interface MapKitSearchInstance {
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

export interface MapKitAnnotationEvent {
  target: MapKitMarkerAnnotation;
}

export interface MapKitMarkerAnnotation {
  coordinate: MapKitCoordinate;
  data?: unknown;
  clusteringIdentifier?: string | null;
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
export type MapKitRegionPriority = "default" | "required";

export interface MapKitGlobal {
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

export function getMapKit(): MapKitGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { mapkit?: MapKitGlobal }).mapkit ?? null;
}

// MapKit JS accepts these as plain strings on `map.mapType`. Using literals
// avoids the `mapkit.Map.MapTypes` enum lookup which (a) lives under
// `mapkit.Map`, not the top-level `mapkit`, and (b) isn't guaranteed to be
// populated immediately after `mapkit.init()`.
export function mapTypeToMapKit(type: MapsMapType): string {
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

// Mirror MapKit JS's `mapkit.Map.ColorSchemes` runtime values. We use plain
// string literals for the same reason as `mapTypeToMapKit` above — the
// enum lives under `mapkit.Map` and may not be populated synchronously
// during the first construction. ryOS exposes a single `isDarkMode` flag
// (only the Aqua theme supports dark mode today) so we collapse straight
// to "dark" / "light" rather than using "adaptive" — that way an explicit
// per-theme light/dark override in the ryOS theme store always wins over
// the OS-level `prefers-color-scheme`.
//   https://developer.apple.com/documentation/mapkitjs/colorscheme
export function isDarkModeToMapKit(isDarkMode: boolean): string {
  return isDarkMode ? "dark" : "light";
}
