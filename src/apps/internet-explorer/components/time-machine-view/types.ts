export type PreviewSource = "html" | "url";

export interface TimeMachineViewProps {
  isOpen: boolean;
  onClose: () => void;
  cachedYears: string[];
  currentUrl: string;
  onSelectYear: (year: string) => void;
  currentSelectedYear: string;
}

export interface TimeMachineUiState {
  activeYearIndex: number;
  navigationDirection: "forward" | "backward" | "none";
  previewYear: string | null;
  previewContent: string | null;
  previewSourceType: PreviewSource | null;
  previewStatus: "idle" | "loading" | "success" | "error";
  previewError: string | null;
  isIframeLoaded: boolean;
}

export type TimeMachineUiAction =
  | { type: "setActiveYearIndex"; value: number | ((prev: number) => number) }
  | { type: "setNavigationDirection"; value: "forward" | "backward" | "none" }
  | { type: "setPreviewYear"; value: string | null }
  | { type: "setPreviewContent"; value: string | null }
  | { type: "setPreviewSourceType"; value: PreviewSource | null }
  | { type: "setPreviewStatus"; value: "idle" | "loading" | "success" | "error" }
  | { type: "setPreviewError"; value: string | null }
  | { type: "setIsIframeLoaded"; value: boolean };

export type ShaderOption =
  import("@/components/shared/GalaxyBackground").ShaderType | "off";
