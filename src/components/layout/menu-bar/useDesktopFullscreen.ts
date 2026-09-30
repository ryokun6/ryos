import { useState, useEffect } from "react";
import { hasDesktopWindowChrome } from "@/utils/platform";

let cachedDesktopFullscreen: boolean | null = null;

export function useDesktopFullscreen(): boolean {
  const hasWindowChrome = hasDesktopWindowChrome();
  const [isFullscreen, setIsFullscreen] = useState(
    () => cachedDesktopFullscreen ?? false
  );

  useEffect(() => {
    if (!hasWindowChrome || !window.ryosDesktop) {
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
  }, [hasWindowChrome]);

  return isFullscreen;
}
