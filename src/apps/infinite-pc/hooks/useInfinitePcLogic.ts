import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppStore } from "@/stores/useAppStore";
import {
  useInfinitePcStore,
  type PcPreset,
} from "@/stores/useInfinitePcStore";
import { helpItems } from "../metadata";
import { useShallow } from "zustand/react/shallow";

export type { PcPreset } from "@/stores/useInfinitePcStore";
export { PC_PRESETS } from "@/stores/useInfinitePcStore";

/** Same-origin wrapper URL with COEP/COOP for SharedArrayBuffer; iframes copy.sh/v86 */
function buildWrapperUrl(preset: PcPreset): string {
  const params = new URLSearchParams();
  params.set("profile", preset.profile);
  return `/embed/pc?${params.toString()}`;
}

// Default window size for the preset grid (content only)
export const DEFAULT_WINDOW_SIZE = { width: 640, height: 480 };

const DEFAULT_TITLEBAR_HEIGHT = 24;
export const DEFAULT_WINDOW_SIZE_WITH_TITLEBAR = {
  width: DEFAULT_WINDOW_SIZE.width,
  height: DEFAULT_WINDOW_SIZE.height + DEFAULT_TITLEBAR_HEIGHT,
};

// Titlebar height per theme so auto-resize fits content + titlebar
const TITLEBAR_HEIGHT_BY_THEME: Record<string, number> = {
  macosx: 24,
  system7: 24,
  xp: 30,
  win98: 22,
};

interface UseInfinitePcLogicProps {
  isWindowOpen: boolean;
  instanceId?: string;
}

/**
 * Aggregated download progress reported by the v86 wrapper iframe.
 * Phases:
 *  - "starting": wrapper booted, no downloads reported yet
 *  - "downloading": at least one `download-progress` event seen
 *  - "booting": all known files at 100% but emulator not yet ready
 *  - "ready": emulator-loaded fired (overlay hidden by `isEmulatorLoaded`)
 */
export interface PcLoadProgress {
  phase: "starting" | "downloading" | "booting";
  loaded: number;
  total: number;
  fileName: string | null;
  fileIndex: number;
  fileCount: number;
}

const INITIAL_PROGRESS: PcLoadProgress = {
  phase: "starting",
  loaded: 0,
  total: 0,
  fileName: null,
  fileIndex: 0,
  fileCount: 0,
};

interface InfinitePcUiState {
  selectedPreset: PcPreset | null;
  isEmulatorLoaded: boolean;
  loadProgress: PcLoadProgress;
  loadError: string | null;
}

const initialState: InfinitePcUiState = {
  selectedPreset: null,
  isEmulatorLoaded: false,
  loadProgress: INITIAL_PROGRESS,
  loadError: null,
};

type InfinitePcUiAction =
  | { type: "setSelectedPreset"; value: PcPreset | null }
  | { type: "setIsEmulatorLoaded"; value: boolean }
  | { type: "setLoadProgress"; value: PcLoadProgress | ((prev: PcLoadProgress) => PcLoadProgress) }
  | { type: "setLoadError"; value: string | null };

function reducer(
  state: InfinitePcUiState,
  action: InfinitePcUiAction
): InfinitePcUiState {
  switch (action.type) {
    case "setSelectedPreset":
      return { ...state, selectedPreset: action.value };
    case "setIsEmulatorLoaded":
      return { ...state, isEmulatorLoaded: action.value };
    case "setLoadProgress":
      return {
        ...state,
        loadProgress:
          typeof action.value === "function"
            ? action.value(state.loadProgress)
            : action.value,
      };
    case "setLoadError":
      return { ...state, loadError: action.value };
    default:
      return state;
  }
}

export function useInfinitePcLogic({
  isWindowOpen: _isWindowOpen,
  instanceId,
}: UseInfinitePcLogicProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [state, dispatch] = useReducer(reducer, initialState);
  const { selectedPreset, isEmulatorLoaded, loadProgress, loadError } = state;
  const setLoadProgress = useCallback(
    (value: PcLoadProgress | ((prev: PcLoadProgress) => PcLoadProgress)) => {
      dispatch({ type: "setLoadProgress", value });
    },
    []
  );
  const setLoadError = useCallback((value: string | null) => {
    dispatch({ type: "setLoadError", value });
  }, []);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { setSelectedPreset: setSelectedPresetStore, setIsEmulatorLoaded: setIsEmulatorLoadedStore } =
    useInfinitePcStore(
      useShallow((state) => ({
        setSelectedPreset: state.setSelectedPreset,
        setIsEmulatorLoaded: state.setIsEmulatorLoaded,
      }))
    );

  const setSelectedPreset = useCallback(
    (preset: PcPreset | null) => {
      dispatch({ type: "setSelectedPreset", value: preset });
      setSelectedPresetStore(preset);
    },
    [setSelectedPresetStore]
  );

  const setIsEmulatorLoaded = useCallback(
    (loaded: boolean) => {
      dispatch({ type: "setIsEmulatorLoaded", value: loaded });
      setIsEmulatorLoadedStore(loaded);
    },
    [setIsEmulatorLoadedStore]
  );

  const { t } = useTranslation();
  const { currentTheme, isWindowsTheme: isXpTheme } = useThemeFlags();
  const translatedHelpItems = useTranslatedHelpItems("pc", helpItems);
  const embedUrl = selectedPreset ? buildWrapperUrl(selectedPreset) : null;

  const resizeWindow = useCallback(
    (size: { width: number; height: number }) => {
      if (!instanceId) return;
      const { instances, updateInstanceWindowState } = useAppStore.getState();
      const theme = useThemeStore.getState().current;
      const instance = instances[instanceId];
      if (instance) {
        const titlebarHeight = TITLEBAR_HEIGHT_BY_THEME[theme] ?? 24;
        updateInstanceWindowState(
          instanceId,
          instance.position ?? { x: 100, y: 100 },
          {
            width: Math.round(size.width),
            height: Math.round(size.height) + titlebarHeight,
          }
        );
      }
    },
    [instanceId]
  );

  const handleSelectPreset = useCallback(
    (preset: PcPreset) => {
      setSelectedPreset(preset);
      setIsEmulatorLoaded(false);
      setLoadProgress(INITIAL_PROGRESS);
      setLoadError(null);
      resizeWindow(preset.screenSize);
    },
    [resizeWindow, setSelectedPreset, setIsEmulatorLoaded]
  );

  const handleBackToPresets = useCallback(() => {
    setSelectedPreset(null);
    setIsEmulatorLoaded(false);
    setLoadProgress(INITIAL_PROGRESS);
    setLoadError(null);
    resizeWindow(DEFAULT_WINDOW_SIZE);
  }, [resizeWindow, setSelectedPreset, setIsEmulatorLoaded]);

  // The wrapper iframe is same-origin and we control its scripts, so the
  // postMessage bridge is the source of truth for "ready". The native
  // iframe.onload event fires after the wrapper HTML loads (~100ms),
  // which is way before v86 has actually downloaded any OS image, so we
  // intentionally don't flip `isEmulatorLoaded` here.
  const handleIframeLoad = useCallback(() => {}, []);

  const postEmulatorCommand = useCallback((command: "fullscreen" | "screenshot") => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: "_infinite_pc_command", command },
      window.location.origin
    );
  }, []);

  const handleFullScreen = useCallback(() => {
    if (!selectedPreset) return;
    postEmulatorCommand("fullscreen");
  }, [postEmulatorCommand, selectedPreset]);

  const downloadScreenshot = useCallback(
    (dataUrl: string) => {
      if (!selectedPreset) return;
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${selectedPreset.name.replace(/\s+/g, "-")}-${timestamp}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [selectedPreset]
  );

  const handleCaptureScreenshot = useCallback(() => {
    if (!selectedPreset) return;
    postEmulatorCommand("screenshot");
  }, [postEmulatorCommand, selectedPreset]);

  useEffect(() => {
    const handleAppMenuFullScreen = (
      e: CustomEvent<{ appId: string; instanceId: string }>
    ) => {
      if (e.detail.appId !== "pc") return;
      if (instanceId && e.detail.instanceId !== instanceId) return;
      if (selectedPreset) postEmulatorCommand("fullscreen");
    };
    window.addEventListener(
      "toggleAppFullScreen",
      handleAppMenuFullScreen as EventListener
    );
    return () =>
      window.removeEventListener(
        "toggleAppFullScreen",
        handleAppMenuFullScreen as EventListener
      );
  }, [instanceId, postEmulatorCommand, selectedPreset]);

  // Reset store state on unmount so the next open starts at the preset grid
  useEffect(() => {
    return () => {
      setSelectedPresetStore(null);
      setIsEmulatorLoadedStore(false);
    };
  }, [setSelectedPresetStore, setIsEmulatorLoadedStore]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (
        !data ||
        typeof data !== "object" ||
        data.type !== "_infinite_pc_bridge"
      )
        return;
      const payload = data.payload;
      if (!payload || typeof payload !== "object") return;
      switch (payload.type) {
        case "download_start": {
          setLoadProgress((prev) => ({ ...prev, phase: "starting" }));
          setLoadError(null);
          break;
        }
        case "download_progress": {
          const loaded = Number(payload.loaded) || 0;
          const total = Number(payload.total) || 0;
          // Once total > 0 and loaded === total we've finished all known
          // downloads but the emulator isn't ready yet — call that "booting".
          const phase: PcLoadProgress["phase"] =
            total > 0 && loaded >= total ? "booting" : "downloading";
          setLoadProgress({
            phase,
            loaded,
            total,
            fileName:
              typeof payload.file_name === "string" ? payload.file_name : null,
            fileIndex: Number(payload.file_index) || 0,
            fileCount: Number(payload.file_count) || 0,
          });
          break;
        }
        case "emulator_loaded": {
          setIsEmulatorLoaded(true);
          break;
        }
        case "emulator_error": {
          setLoadError(
            typeof payload.message === "string"
              ? payload.message
              : t("apps.pc.status.emulatorStartFailed")
          );
          break;
        }
        case "screenshot_ready": {
          if (typeof payload.dataUrl === "string") {
            downloadScreenshot(payload.dataUrl);
          }
          break;
        }
        case "screenshot_error": {
          console.warn(
            "Virtual PC screenshot:",
            typeof payload.message === "string" ? payload.message : payload
          );
          alert(t("apps.pc.screenshotUnavailable"));
          break;
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [downloadScreenshot, setIsEmulatorLoaded, t]);

  return {
    t,
    translatedHelpItems,
    currentTheme,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    selectedPreset,
    isEmulatorLoaded,
    loadProgress,
    loadError,
    embedUrl,
    iframeRef,
    handleSelectPreset,
    handleBackToPresets,
    handleIframeLoad,
    handleFullScreen,
    handleCaptureScreenshot,
  };
}
