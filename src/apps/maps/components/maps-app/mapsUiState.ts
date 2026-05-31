import type { MapKitCoordinate, MapKitPlace } from "./mapKitTypes";

export interface MapsSearchResult {
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

export interface MapsUiState {
  searchQuery: string;
  searchResults: MapsSearchResult[];
  isSearching: boolean;
  searchError: string | null;
  selectedResultId: string | null;
  isShowingResults: boolean;
  isPlacesDrawerOpen: boolean;
  showLoadingOverlay: boolean;
}

export type MapsUiAction =
  | { type: "setSearchQuery"; query: string }
  | { type: "searchReset" }
  | { type: "searchStart" }
  | { type: "searchSuccess"; results: MapsSearchResult[] }
  | { type: "searchError"; error: string }
  | { type: "setSelectedResultId"; id: string | null }
  | { type: "setShowingResults"; isShowingResults: boolean }
  | { type: "setPlacesDrawerOpen"; isOpen: boolean }
  | { type: "togglePlacesDrawer" }
  | { type: "setShowLoadingOverlay"; show: boolean };

export const initialUiState: MapsUiState = {
  searchQuery: "",
  searchResults: [],
  isSearching: false,
  searchError: null,
  selectedResultId: null,
  isShowingResults: false,
  isPlacesDrawerOpen: false,
  showLoadingOverlay: false,
};

export function mapsUiReducer(state: MapsUiState, action: MapsUiAction): MapsUiState {
  switch (action.type) {
    case "setSearchQuery":
      return { ...state, searchQuery: action.query };
    case "searchReset":
      return {
        ...state,
        searchResults: [],
        searchError: null,
        isSearching: false,
        isShowingResults: false,
      };
    case "searchStart":
      return {
        ...state,
        isSearching: true,
        searchError: null,
        isShowingResults: true,
      };
    case "searchSuccess":
      return {
        ...state,
        isSearching: false,
        searchResults: action.results,
      };
    case "searchError":
      return {
        ...state,
        isSearching: false,
        searchResults: [],
        searchError: action.error,
      };
    case "setSelectedResultId":
      return { ...state, selectedResultId: action.id };
    case "setShowingResults":
      return { ...state, isShowingResults: action.isShowingResults };
    case "setPlacesDrawerOpen":
      return { ...state, isPlacesDrawerOpen: action.isOpen };
    case "togglePlacesDrawer":
      return { ...state, isPlacesDrawerOpen: !state.isPlacesDrawerOpen };
    case "setShowLoadingOverlay":
      return { ...state, showLoadingOverlay: action.show };
    default:
      return state;
  }
}

// Coordinate-degree span used when focusing on a single place (search hit,
// saved-place tap, persisted selection re-center). ~0.012° ≈ 1.3 km wide
// at the equator — neighborhood / street level — which mirrors how the
// system Maps app zooms when you tap a result. The previous value (0.05)
// stayed at region level and made it hard to see surrounding streets.
export const FOCUS_PLACE_SPAN_DEG = 0.012;

// Wider span used for the initial framing around the user's current
// location or home — ~0.12° ≈ 13 km wide at the equator, which covers a
// full city / metro area instead of zooming all the way down to a single
// block. Matches the original SF default region the map boots with.
export const CITY_LEVEL_SPAN_DEG = 0.12;

// Cap how long we'll wait for a quick geolocation read on first open.
// We only call `getCurrentPosition` when the Permissions API already
// reports `granted`, but even then a stale GPS lock can take seconds to
// resolve — bail early so the home fallback still gets a chance to frame
// the viewport.
export const INITIAL_LOCATION_TIMEOUT_MS = 4000;

/** Per click: halve / double the visible span (MapKit `CoordinateRegion`). */
export const MAP_ZOOM_STEP_FACTOR = 0.5;
export const MAP_MIN_SPAN_DEG = 0.0005;
export const MAP_MAX_SPAN_DEG = 120;

/** Defer the loading overlay until MapKit has been loading this long. */
export const LOADING_OVERLAY_DELAY_MS = 600;
