import type { CoverFlowUiAction, CoverFlowUiState } from "./types";

export function coverFlowUiReducer(
  state: CoverFlowUiState,
  action: CoverFlowUiAction
): CoverFlowUiState {
  switch (action.type) {
    case "setSelectedIndex":
      return {
        ...state,
        selectedIndex:
          typeof action.value === "function"
            ? action.value(state.selectedIndex)
            : action.value,
      };
    case "setShowCD":
      return { ...state, showCD: action.value };
    case "setIsFlipped":
      return { ...state, isFlipped: action.value };
    case "setIsFlipAnimating":
      return { ...state, isFlipAnimating: action.value };
    case "setSelectedTrackInAlbum":
      return {
        ...state,
        selectedTrackInAlbum:
          typeof action.value === "function"
            ? action.value(state.selectedTrackInAlbum)
            : action.value,
      };
    default:
      return state;
  }
}
