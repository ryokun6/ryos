import { useCallback, useEffect, useRef, useState } from "react";

export function useWindowFrameTitlebarAutoHide(
  isNoTitlebar: boolean,
  disableTitlebarAutoHide: boolean
) {
  const [isTitlebarHovered, setIsTitlebarHovered] = useState(
    disableTitlebarAutoHide && isNoTitlebar
  );
  const titlebarHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startTitlebarAutoHideTimer = useCallback(() => {
    if (titlebarHideTimeoutRef.current) {
      clearTimeout(titlebarHideTimeoutRef.current);
    }
    if (isNoTitlebar && !disableTitlebarAutoHide) {
      titlebarHideTimeoutRef.current = setTimeout(() => {
        setIsTitlebarHovered(false);
      }, 3000);
    }
  }, [isNoTitlebar, disableTitlebarAutoHide]);

  const showTitlebarWithAutoHide = useCallback(() => {
    setIsTitlebarHovered(true);
    if (!disableTitlebarAutoHide) {
      startTitlebarAutoHideTimer();
    }
  }, [startTitlebarAutoHideTimer, disableTitlebarAutoHide]);

  const hideTitlebar = useCallback(() => {
    setIsTitlebarHovered(false);
    if (titlebarHideTimeoutRef.current) {
      clearTimeout(titlebarHideTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (titlebarHideTimeoutRef.current) {
        clearTimeout(titlebarHideTimeoutRef.current);
      }
    };
  }, []);

  return {
    isTitlebarHovered,
    showTitlebarWithAutoHide,
    hideTitlebar,
  };
}
