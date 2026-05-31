import type { TimeMachineUiAction, TimeMachineUiState } from "./types";

export const initialState: TimeMachineUiState = {
  activeYearIndex: 0,
  navigationDirection: "none",
  previewYear: null,
  previewContent: null,
  previewSourceType: null,
  previewStatus: "idle",
  previewError: null,
  isIframeLoaded: false,
};


export function timeMachineUiReducer(
  state: TimeMachineUiState,
  action: TimeMachineUiAction
): TimeMachineUiState {
  switch (action.type) {
    case "setActiveYearIndex":
      return {
        ...state,
        activeYearIndex:
          typeof action.value === "function"
            ? action.value(state.activeYearIndex)
            : action.value,
      };
    case "setNavigationDirection":
      return { ...state, navigationDirection: action.value };
    case "setPreviewYear":
      return { ...state, previewYear: action.value };
    case "setPreviewContent":
      return { ...state, previewContent: action.value };
    case "setPreviewSourceType":
      return { ...state, previewSourceType: action.value };
    case "setPreviewStatus":
      return { ...state, previewStatus: action.value };
    case "setPreviewError":
      return { ...state, previewError: action.value };
    case "setIsIframeLoaded":
      return { ...state, isIframeLoaded: action.value };
    default:
      return state;
  }
}