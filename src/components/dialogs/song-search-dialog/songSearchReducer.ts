import type { Track } from "@/stores/useIpodStore";
import type {
  SongSearchAction,
  SongSearchResult,
  SongSearchState,
} from "./types";

export function createSongSearchInitialState(
  initialQuery: string
): SongSearchState {
  return {
    query: initialQuery,
    results: [],
    appleMusicResults: [],
    activeAppleMusicTab: "catalog",
    selectedIndex: -1,
    isSearching: false,
    isAdding: false,
    error: null,
  };
}

export function songSearchReducer(
  state: SongSearchState,
  action: SongSearchAction
): SongSearchState {
  switch (action.type) {
    case "resetOnOpen":
      return {
        ...state,
        query: action.query,
        results: [],
        appleMusicResults: [],
        selectedIndex: -1,
        error: null,
      };
    case "setQuery":
      return { ...state, query: action.query };
    case "setActiveAppleMusicTab":
      return {
        ...state,
        activeAppleMusicTab: action.tab,
        appleMusicResults: [],
        selectedIndex: -1,
        error: null,
      };
    case "setSelectedIndex":
      return { ...state, selectedIndex: action.index };
    case "searchStart":
      return {
        ...state,
        isSearching: true,
        error: null,
        results: [],
        appleMusicResults: [],
        selectedIndex: -1,
      };
    case "searchFinish":
      if (action.mode === "appleMusic") {
        return {
          ...state,
          isSearching: false,
          appleMusicResults: action.results as Track[],
          error: action.error,
        };
      }
      return {
        ...state,
        isSearching: false,
        results: action.results as SongSearchResult[],
        error: action.error,
      };
    case "searchError":
      return { ...state, isSearching: false, error: action.error };
    case "setAdding":
      return { ...state, isAdding: action.isAdding };
    case "setError":
      return { ...state, error: action.error };
    default:
      return state;
  }
}
