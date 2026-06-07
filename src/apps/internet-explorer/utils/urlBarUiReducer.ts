import { CSSProperties } from "react";

// Define suggestion type to reuse
export type SuggestionItem = {
  title: string;
  url: string;
  type: "favorite" | "history" | "search";
  year?: string;
  favicon?: string;
  normalizedUrl?: string; // Optional prop for internal use
};

export interface UrlBarUiState {
  isUrlDropdownOpen: boolean;
  filteredSuggestions: SuggestionItem[];
  localUrl: string;
  isSelectingText: boolean;
  selectedSuggestionIndex: number;
  dropdownStyle: CSSProperties;
}

export const urlBarUiInitialState: UrlBarUiState = {
  isUrlDropdownOpen: false,
  filteredSuggestions: [],
  localUrl: "",
  isSelectingText: false,
  selectedSuggestionIndex: 0,
  dropdownStyle: {},
};

export type UrlBarUiAction =
  | { type: "setIsUrlDropdownOpen"; value: boolean }
  | { type: "setFilteredSuggestions"; value: SuggestionItem[] }
  | { type: "setLocalUrl"; value: string }
  | { type: "setIsSelectingText"; value: boolean }
  | { type: "setSelectedSuggestionIndex"; value: number }
  | {
      type: "setDropdownStyle";
      value: CSSProperties | ((prev: CSSProperties) => CSSProperties);
    };

export function urlBarUiReducer(
  state: UrlBarUiState,
  action: UrlBarUiAction
): UrlBarUiState {
  switch (action.type) {
    case "setIsUrlDropdownOpen":
      return { ...state, isUrlDropdownOpen: action.value };
    case "setFilteredSuggestions":
      return { ...state, filteredSuggestions: action.value };
    case "setLocalUrl":
      return { ...state, localUrl: action.value };
    case "setIsSelectingText":
      return { ...state, isSelectingText: action.value };
    case "setSelectedSuggestionIndex":
      return { ...state, selectedSuggestionIndex: action.value };
    case "setDropdownStyle":
      return {
        ...state,
        dropdownStyle:
          typeof action.value === "function"
            ? action.value(state.dropdownStyle)
            : action.value,
      };
    default:
      return state;
  }
}
