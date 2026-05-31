import type { Applet } from "../../utils/appletActions";

export interface AppStoreProps {
  theme?: string;
  sharedAppletId?: string;
  focusWindow?: () => void;
}

export interface AppStoreUiState {
  isLoading: boolean;
  searchQuery: string;
  selectedApplet: Applet | null;
  selectedAppletContent: string;
  isSharedApplet: boolean;
  showListView: boolean;
  isBulkUpdating: boolean;
}

export type AppStoreUiAction =
  | { type: "setLoading"; value: boolean }
  | { type: "setSearchQuery"; value: string }
  | { type: "setSelectedApplet"; value: Applet | null }
  | { type: "setSelectedAppletContent"; value: string }
  | { type: "setShowListView"; value: boolean }
  | { type: "setBulkUpdating"; value: boolean }
  | { type: "setSelectedAppletDetail"; applet: Applet; content: string; isShared: boolean }
  | { type: "clearSelectedAppletDetail" };
