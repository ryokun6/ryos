import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppStore } from "@/stores/useAppStore";
import { 
  useInfiniteMacStore, 
  type ScaleOption, 
  type ScreenData,
  type MacPreset,
} from "@/stores/useInfiniteMacStore";
import { helpItems } from "..";
import { useShallow } from "zustand/react/shallow";

// Re-export types and presets for consumers
export type { ScaleOption, MacPreset, ScreenData } from "@/stores/useInfiniteMacStore";
export { MAC_PRESETS } from "@/stores/useInfiniteMacStore";

/** Same-origin wrapper URL with COEP/COOP for SharedArrayBuffer; params are forwarded to infinitemac.org */
function buildWrapperUrl(preset: MacPreset, scale: number = 1): string {
  const params = new URLSearchParams();
  params.set("disk", preset.disk);
  if (preset.machine) params.set("machine", preset.machine);
  params.set("infinite_hd", "true");
  params.set("saved_hd", "true");
  params.set("screen_scale", String(scale));
  params.set("auto_pause", "true");
  params.set("screen_update_messages", "true");
  return `/embed/infinite-mac?${params.toString()}`;
}

// Default window size for the preset grid (content only)
export const DEFAULT_WINDOW_SIZE = { width: 640, height: 480 };

// Default window size including titlebar (for app registry initial size)
const DEFAULT_TITLEBAR_HEIGHT = 24; // matches TITLEBAR_HEIGHT_BY_THEME fallback
export const DEFAULT_WINDOW_SIZE_WITH_TITLEBAR = {
  width: DEFAULT_WINDOW_SIZE.width,
  height: DEFAULT_WINDOW_SIZE.height + DEFAULT_TITLEBAR_HEIGHT,
};

// Titlebar height per theme so auto-resize fits content + titlebar (matches WindowFrame / themes.css)
const TITLEBAR_HEIGHT_BY_THEME: Record<string, number> = {
  macosx: 24, // notitlebar h-6 spacer
  system7: 24, // 1.5rem
  xp: 30, // 1.875rem, WindowFrame minHeight 30px
  win98: 22, // 1.375rem
};

// MAC_PRESETS is now imported from the store


interface UseInfiniteMacLogicProps {
  isWindowOpen: boolean;
  instanceId?: string;
}

export function useInfiniteMacLogic({
  isWindowOpen: _isWindowOpen,
  instanceId,
}: UseInfiniteMacLogicProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [selectedPreset, setSelectedPresetLocal] = useState<MacPreset | null>(null);
  const [isEmulatorLoaded, setIsEmulatorLoadedLocal] = useState(false);
  const [isPaused, setIsPausedLocal] = useState(false);
  const { 
    scale: currentScale, 
    setScale: setCurrentScale,
    setActiveIframe,
    setSelectedPreset: setSelectedPresetStore,
    setIsEmulatorLoaded: setIsEmulatorLoadedStore,
    setIsPaused: setIsPausedStore,
    setLastScreenData,
  } = useInfiniteMacStore(
    useShallow((state) => ({
      scale: state.scale,
      setScale: state.setScale,
      setActiveIframe: state.setActiveIframe,
      setSelectedPreset: state.setSelectedPreset,
      setIsEmulatorLoaded: state.setIsEmulatorLoaded,
      setIsPaused: state.setIsPaused,
      setLastScreenData: state.setLastScreenData,
    }))
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Store latest screen data for screenshots (from emulator_screen messages)
  const lastScreenDataRef = useRef<ScreenData | null>(null);

  // Sync local state with store for AI tool access
  const setSelectedPreset = useCallback((preset: MacPreset | null) => {
    setSelectedPresetLocal(preset);
    setSelectedPresetStore(preset);
  }, [setSelectedPresetStore]);

  const setIsEmulatorLoaded = useCallback((loaded: boolean) => {
    setIsEmulatorLoadedLocal(loaded);
    setIsEmulatorLoadedStore(loaded);
  }, [setIsEmulatorLoadedStore]);

  const setIsPaused = useCallback((paused: boolean) => {
    setIsPausedLocal(paused);
    setIsPausedStore(paused);
  }, [setIsPausedStore]);

  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const translatedHelpItems = useTranslatedHelpItems("infinite-mac", helpItems);
  const embedUrl = selectedPreset ? buildWrapperUrl(selectedPreset, currentScale) : null;

  const resizeWindow = useCallback(
    (size: { width: number; height: number }, scale: ScaleOption = currentScale) => {
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
            width: Math.round(size.width * scale), 
            height: Math.round(size.height * scale) + titlebarHeight 
          }
        );
      }
    },
    [instanceId, currentScale]
  );

  const handleSelectPreset = useCallback(
    (preset: MacPreset) => {
      setSelectedPreset(preset);
      setIsEmulatorLoaded(false);
      setIsPaused(false);
      // Resize window to match emulator screen size
      resizeWindow(preset.screenSize);
    },
    [resizeWindow, setIsEmulatorLoaded, setIsPaused, setSelectedPreset]
  );

  const handleBackToPresets = useCallback(() => {
    setSelectedPreset(null);
    setIsEmulatorLoaded(false);
    setIsPaused(false);
    // Resize window back to default for preset grid
    resizeWindow(DEFAULT_WINDOW_SIZE);
  }, [resizeWindow, setIsEmulatorLoaded, setIsPaused, setSelectedPreset]);

  const sendEmulatorCommand = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      const win = iframeRef.current?.contentWindow;
      if (win) {
        win.postMessage({ type, ...payload }, window.location.origin);
      }
    },
    []
  );

  const handlePause = useCallback(() => {
    sendEmulatorCommand("emulator_pause");
    setIsPaused(true);
  }, [sendEmulatorCommand, setIsPaused]);

  const handleUnpause = useCallback(() => {
    sendEmulatorCommand("emulator_unpause");
    setIsPaused(false);
  }, [sendEmulatorCommand, setIsPaused]);

  const handleSetScale = useCallback(
    (scale: ScaleOption) => {
      if (scale === currentScale) return;
      setCurrentScale(scale);
      // Changing scale reloads the emulator (new screen_scale in URL)
      setIsEmulatorLoaded(false);
      lastScreenDataRef.current = null;
      if (selectedPreset) {
        resizeWindow(selectedPreset.screenSize, scale);
      }
    },
    [currentScale, resizeWindow, selectedPreset, setCurrentScale, setIsEmulatorLoaded]
  );

  const handleCaptureScreenshot = useCallback(() => {
    if (!selectedPreset) return;

    const screenData = lastScreenDataRef.current;
    
    // If we have screen data from emulator_screen messages, use it
    if (screenData && screenData.data && screenData.data.length > 0) {
      try {
        // Create canvas from the RGBA pixel data
        const canvas = document.createElement("canvas");
        canvas.width = screenData.width;
        canvas.height = screenData.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Create ImageData from the Uint8Array (RGBA format)
        const imageData = new ImageData(
          new Uint8ClampedArray(screenData.data),
          screenData.width,
          screenData.height
        );
        ctx.putImageData(imageData, 0, 0);

        // Convert to blob and download
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            a.download = `${selectedPreset.name.replace(/\s+/g, "-")}-${timestamp}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        }, "image/png");
        return;
      } catch (error) {
        console.error("Failed to capture screenshot from pixel data:", error);
      }
    }

    // Fallback: Try to access the canvas directly
    const iframe = iframeRef.current;
    if (iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        const innerIframe = iframeDoc?.getElementById("emu") as HTMLIFrameElement | null;
        if (innerIframe) {
          // Try to access inner iframe's canvas (may fail due to cross-origin)
          try {
            const innerDoc = innerIframe.contentDocument || innerIframe.contentWindow?.document;
            const canvas = innerDoc?.querySelector("canvas") as HTMLCanvasElement | null;
            if (canvas) {
              const dataUrl = canvas.toDataURL("image/png");
              const a = document.createElement("a");
              a.href = dataUrl;
              const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
              a.download = `${selectedPreset.name.replace(/\s+/g, "-")}-${timestamp}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              return;
            }
          } catch {
            // Cross-origin restriction - expected
          }
        }
      } catch (e) {
        console.log("Screenshot: Canvas fallback failed", e);
      }
    }

    // If all else fails, show helpful message
    console.log("Screenshot: Unable to capture. Screen data not available from emulator.");
    alert(t("apps.infinite-mac.screenshotUnavailable", "Screenshot not available. Use your browser's screenshot tool (Cmd+Shift+4 on Mac, Win+Shift+S on Windows)."));
  }, [selectedPreset, t]);

  // Only show emulator after iframe sends {"type": "emulator_loaded"} via postMessage
  // Also sync the iframe window to the store for AI tool access
  const handleIframeLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      setActiveIframe(win);
    }
  }, [setActiveIframe]);

  // Clear active iframe from store when component unmounts
  useEffect(() => {
    return () => {
      setActiveIframe(null);
      setSelectedPresetStore(null);
      setIsEmulatorLoadedStore(false);
      setIsPausedStore(false);
      setLastScreenData(null);
    };
  }, [setActiveIframe, setSelectedPresetStore, setIsEmulatorLoadedStore, setIsPausedStore, setLastScreenData]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow ?? null;
      const isBridgeMessage =
        e.origin === window.location.origin &&
        e.source === iframeWindow &&
        e.data?.type === "_infinite_mac_bridge";

      // Bridge wrapper forwards as { type: '_infinite_mac_bridge', payload }; payload is
      // the raw iframe message (emulator_loaded, emulator_screen, etc. per Infinite Mac embed API).
      const data = isBridgeMessage ? e.data.payload : undefined;
      if (!data || typeof data !== "object") return;
      switch (data.type) {
        case "emulator_loaded":
          setIsEmulatorLoaded(true);
          break;
        case "emulator_screen": {
          const w = data.width;
          const h = data.height;
          if (typeof w === "number" && typeof h === "number") {
            resizeWindow({ width: w, height: h });
            // Store screen data for screenshots (data is Uint8Array in RGBA format)
            // After postMessage, data might be Uint8Array, ArrayBuffer, or array-like object
            const pixelData = data.data;
            if (pixelData) {
              try {
                // Try to convert to Uint8Array regardless of the exact type
                let uint8Data: Uint8Array;
                if (pixelData.buffer instanceof ArrayBuffer) {
                  // It's a TypedArray view
                  uint8Data = new Uint8Array(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength);
                } else if (pixelData instanceof ArrayBuffer) {
                  uint8Data = new Uint8Array(pixelData);
                } else {
                  // Try direct conversion (works for arrays and array-like objects)
                  uint8Data = new Uint8Array(pixelData);
                }
                if (uint8Data.length > 0) {
                  const screenData = {
                    width: w,
                    height: h,
                    data: uint8Data,
                  };
                  lastScreenDataRef.current = screenData;
                  // Sync to store for AI tool access
                  setLastScreenData(screenData);
                }
              } catch {
                // Conversion failed, log for debugging
                console.log("Failed to convert screen data:", typeof pixelData, pixelData);
              }
            }
          }
          break;
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [resizeWindow, setIsEmulatorLoaded, setLastScreenData]);

  // Listen for AI tool preset selection events
  useEffect(() => {
    const handleSelectPresetEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ preset: MacPreset }>;
      if (customEvent.detail?.preset) {
        handleSelectPreset(customEvent.detail.preset);
      }
    };

    window.addEventListener("infiniteMac:selectPreset", handleSelectPresetEvent);
    return () => {
      window.removeEventListener("infiniteMac:selectPreset", handleSelectPresetEvent);
    };
  }, [handleSelectPreset]);

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
    isPaused,
    currentScale,
    embedUrl,
    iframeRef,
    handleSelectPreset,
    handleBackToPresets,
    handlePause,
    handleUnpause,
    handleSetScale,
    handleCaptureScreenshot,
    handleIframeLoad,
    sendEmulatorCommand,
  };
}
