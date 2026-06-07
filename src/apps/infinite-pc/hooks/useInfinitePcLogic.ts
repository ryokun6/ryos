import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  useInfinitePcStore,
  type PcPreset,
} from "@/stores/useInfinitePcStore";
import { helpItems } from "../metadata";
import {
  DEFAULT_WINDOW_SIZE,
  DEFAULT_WINDOW_SIZE_WITH_TITLEBAR,
} from "../windowConfig";
import { useShallow } from "zustand/react/shallow";
import { useEmulatorAppLogic } from "@/apps/shared-emulator/useEmulatorAppLogic";

export type { PcPreset } from "@/stores/useInfinitePcStore";
export { PC_PRESETS } from "@/stores/useInfinitePcStore";

/** Same-origin wrapper URL with COEP/COOP for SharedArrayBuffer; iframes copy.sh/v86 */
function buildWrapperUrl(preset: PcPreset): string {
  const params = new URLSearchParams();
  params.set("profile", preset.profile);
  return `/embed/pc?${params.toString()}`;
}

export { DEFAULT_WINDOW_SIZE, DEFAULT_WINDOW_SIZE_WITH_TITLEBAR };

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

interface UseInfinitePcLogicProps {
  isWindowOpen: boolean;
  instanceId?: string;
}

export function useInfinitePcLogic({
  isWindowOpen: _isWindowOpen,
  instanceId,
}: UseInfinitePcLogicProps) {
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
      useShallow((store) => ({
        setSelectedPreset: store.setSelectedPreset,
        setIsEmulatorLoaded: store.setIsEmulatorLoaded,
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

  const resetLoadState = useCallback(() => {
    setLoadProgress(INITIAL_PROGRESS);
    setLoadError(null);
  }, [setLoadProgress, setLoadError]);

  const {
    t,
    translatedHelpItems,
    currentTheme,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    handleSelectPreset,
    handleBackToPresets,
  } = useEmulatorAppLogic<PcPreset>({
    instanceId,
    defaultWindowSize: DEFAULT_WINDOW_SIZE,
    helpAppId: "pc",
    helpItems,
    selectedPreset,
    setSelectedPreset,
    setIsEmulatorLoaded,
    onSelectPreset: resetLoadState,
    onBackToPresets: resetLoadState,
  });

  const embedUrl = selectedPreset ? buildWrapperUrl(selectedPreset) : null;

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
  }, [downloadScreenshot, setIsEmulatorLoaded, t, setLoadProgress, setLoadError]);

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
