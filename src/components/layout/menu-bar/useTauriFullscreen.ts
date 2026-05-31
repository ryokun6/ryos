import { useState, useEffect } from "react";
import { isTauri } from "@/utils/platform";

let cachedTauriFullscreen: boolean | null = null;

export function useTauriFullscreen(): boolean {
  const isTauriApp = isTauri();
  const [isFullscreen, setIsFullscreen] = useState(
    () => cachedTauriFullscreen ?? false
  );

  useEffect(() => {
    if (!isTauriApp) return;

    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();

        const fullscreen = await win.isFullscreen();
        cachedTauriFullscreen = fullscreen;
        setIsFullscreen(fullscreen);

        unlisten = await win.onResized(async () => {
          const fs = await win.isFullscreen();
          cachedTauriFullscreen = fs;
          setIsFullscreen(fs);
        });
      } catch (error) {
        console.error("Error setting fullscreen state:", error);
      }
    })();

    return () => {
      unlisten?.();
    };
  }, [isTauriApp]);

  return isFullscreen;
}
