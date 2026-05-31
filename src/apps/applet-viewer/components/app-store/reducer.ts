import type { AppStoreUiAction, AppStoreUiState } from "./types";

export const initialState: AppStoreUiState = {
  isLoading: true,
  searchQuery: "",
  selectedApplet: null,
  selectedAppletContent: "",
  isSharedApplet: false,
  showListView: false,
  isBulkUpdating: false,
};

export function appStoreReducer(
  state: AppStoreUiState,
  action: AppStoreUiAction
): AppStoreUiState {
  switch (action.type) {
    case "setLoading":
      return { ...state, isLoading: action.value };
    case "setSearchQuery":
      return { ...state, searchQuery: action.value };
    case "setSelectedApplet":
      return { ...state, selectedApplet: action.value };
    case "setSelectedAppletContent":
      return { ...state, selectedAppletContent: action.value };
    case "setShowListView":
      return { ...state, showListView: action.value };
    case "setBulkUpdating":
      return { ...state, isBulkUpdating: action.value };
    case "setSelectedAppletDetail":
      return {
        ...state,
        selectedApplet: action.applet,
        selectedAppletContent: action.content,
        isSharedApplet: action.isShared,
      };
    case "clearSelectedAppletDetail":
      return {
        ...state,
        selectedApplet: null,
        isSharedApplet: false,
      };
    default:
      return state;
  }
}
