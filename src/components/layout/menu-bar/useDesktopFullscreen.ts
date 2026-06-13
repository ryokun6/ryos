import { useState, useEffect } from "react";
import { isDesktop } from "@/utils/platform";

let cachedDesktopFullscreen: boolean | null = null;

export function useDesktopFullscreen(): boolean {
  const isDesktopApp = isDesktop();
  const [isFullscreen, setIsFullscreen] = useState(
    () => cachedDesktopFullscreen ?? false
  );

  useEffect(() => {
    if (!isDesktopApp || !window.ryosDesktop) {
      return;
    }

    const desktop = window.ryosDesktop;
    let dispose: (() => void) | undefined;

    void (async () => {
      try {
        const fullscreen = await desktop.isFullscreen();
        cachedDesktopFullscreen = fullscreen;
        setIsFullscreen(fullscreen);

        dispose = desktop.onFullscreenChange((nextFullscreen) => {
          cachedDesktopFullscreen = nextFullscreen;
          setIsFullscreen(nextFullscreen);
        });
      } catch (error) {
        console.error("Error setting desktop fullscreen state:", error);
      }
    })();

    return () => {
      dispose?.();
    };
  }, [isDesktopApp]);

  return isFullscreen;
}

/** @deprecated Use {@link useDesktopFullscreen}. */
export const useTauriFullscreen = useDesktopFullscreen;
