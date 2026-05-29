import { useCallback, useEffect, useState } from "react";
import {
  isRyosFullscreenActive,
  isRyosFullscreenSupported,
  toggleRyosFullscreen,
} from "@/utils/ryosFullscreen";

export function useRyosFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => isRyosFullscreenActive());
  const supported = isRyosFullscreenSupported();

  useEffect(() => {
    const sync = () => setIsFullscreen(isRyosFullscreenActive());
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = useCallback(() => {
    void toggleRyosFullscreen();
  }, []);

  return { isFullscreen, supported, toggle };
}
