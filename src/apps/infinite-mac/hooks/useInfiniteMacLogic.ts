import { useCallback, useEffect, useRef } from "react";
import {
  useInfiniteMacStore,
  type ScaleOption,
  type ScreenData,
  type MacPreset,
} from "@/stores/useInfiniteMacStore";
import { helpItems } from "../metadata";
import {
  DEFAULT_WINDOW_SIZE,
  DEFAULT_WINDOW_SIZE_WITH_TITLEBAR,
} from "../windowConfig";
import { useShallow } from "zustand/react/shallow";
import { useEmulatorAppLogic } from "@/apps/shared-emulator/useEmulatorAppLogic";

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

export { DEFAULT_WINDOW_SIZE, DEFAULT_WINDOW_SIZE_WITH_TITLEBAR };

interface UseInfiniteMacLogicProps {
  isWindowOpen: boolean;
  instanceId?: string;
}

export function useInfiniteMacLogic({
  isWindowOpen: _isWindowOpen,
  instanceId,
}: UseInfiniteMacLogicProps) {
  const {
    scale: currentScale,
    setScale: setCurrentScale,
    setActiveIframe,
    selectedPreset,
    isEmulatorLoaded,
    isPaused,
    setSelectedPreset,
    setIsEmulatorLoaded,
    setIsPaused,
    setLastScreenData,
  } = useInfiniteMacStore(
    useShallow((state) => ({
      scale: state.scale,
      setScale: state.setScale,
      setActiveIframe: state.setActiveIframe,
      selectedPreset: state.selectedPreset,
      isEmulatorLoaded: state.isEmulatorLoaded,
      isPaused: state.isPaused,
      setSelectedPreset: state.setSelectedPreset,
      setIsEmulatorLoaded: state.setIsEmulatorLoaded,
      setIsPaused: state.setIsPaused,
      setLastScreenData: state.setLastScreenData,
    }))
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastScreenDataRef = useRef<ScreenData | null>(null);

  const {
    t,
    translatedHelpItems,
    currentTheme,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    resizeWindow,
    handleSelectPreset,
    handleBackToPresets,
  } = useEmulatorAppLogic<MacPreset>({
    instanceId,
    defaultWindowSize: DEFAULT_WINDOW_SIZE,
    helpAppId: "infinite-mac",
    helpItems,
    selectedPreset,
    setSelectedPreset,
    setIsEmulatorLoaded,
    contentScale: currentScale,
    onSelectPreset: () => setIsPaused(false),
    onBackToPresets: () => setIsPaused(false),
  });

  const embedUrl = selectedPreset ? buildWrapperUrl(selectedPreset, currentScale) : null;

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
      setIsEmulatorLoaded(false);
      lastScreenDataRef.current = null;
      if (selectedPreset) {
        resizeWindow(selectedPreset.screenSize, scale);
      }
    },
    [selectedPreset, resizeWindow, currentScale, setCurrentScale, setIsEmulatorLoaded]
  );

  const handleCaptureScreenshot = useCallback(() => {
    if (!selectedPreset) return;

    const screenData = lastScreenDataRef.current;

    if (screenData && screenData.data && screenData.data.length > 0) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = screenData.width;
        canvas.height = screenData.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const imageData = new ImageData(
          new Uint8ClampedArray(screenData.data),
          screenData.width,
          screenData.height
        );
        ctx.putImageData(imageData, 0, 0);

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

    const iframe = iframeRef.current;
    if (iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        const innerIframe = iframeDoc?.getElementById("emu") as HTMLIFrameElement | null;
        if (innerIframe) {
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

    console.log("Screenshot: Unable to capture. Screen data not available from emulator.");
    alert(
      t(
        "apps.infinite-mac.screenshotUnavailable",
        "Screenshot not available. Use your browser's screenshot tool (Cmd+Shift+4 on Mac, Win+Shift+S on Windows)."
      )
    );
  }, [selectedPreset, t]);

  const handleIframeLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      setActiveIframe(win);
    }
  }, [setActiveIframe]);

  useEffect(() => {
    return () => {
      setActiveIframe(null);
      setSelectedPreset(null);
      setIsEmulatorLoaded(false);
      setIsPaused(false);
      setLastScreenData(null);
    };
  }, [setActiveIframe, setSelectedPreset, setIsEmulatorLoaded, setIsPaused, setLastScreenData]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow ?? null;
      const isBridgeMessage =
        e.origin === window.location.origin &&
        e.source === iframeWindow &&
        e.data?.type === "_infinite_mac_bridge";

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
            const pixelData = data.data;
            if (pixelData) {
              try {
                let uint8Data: Uint8Array;
                if (pixelData.buffer instanceof ArrayBuffer) {
                  uint8Data = new Uint8Array(
                    pixelData.buffer,
                    pixelData.byteOffset,
                    pixelData.byteLength
                  );
                } else if (pixelData instanceof ArrayBuffer) {
                  uint8Data = new Uint8Array(pixelData);
                } else {
                  uint8Data = new Uint8Array(pixelData);
                }
                if (uint8Data.length > 0) {
                  const screenData = {
                    width: w,
                    height: h,
                    data: uint8Data,
                  };
                  lastScreenDataRef.current = screenData;
                  setLastScreenData(screenData);
                }
              } catch {
                // Conversion failed
              }
            }
          }
          break;
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [resizeWindow, setLastScreenData, setIsEmulatorLoaded]);

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
