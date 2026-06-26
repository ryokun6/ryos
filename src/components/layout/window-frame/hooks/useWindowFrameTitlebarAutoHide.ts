import { useCallback, useEffect, useRef, useState } from "react";

export function useWindowFrameTitlebarAutoHide(
  isNoTitlebar: boolean,
  disableTitlebarAutoHide: boolean
) {
  const [isTitlebarHovered, setIsTitlebarHovered] = useState(
    disableTitlebarAutoHide && isNoTitlebar
  );
  const titlebarHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // When auto-hide gets disabled (e.g. switching from the Books reader back to
  // the shelf), force the titlebar visible. The initial state only evaluates
  // once, so without this the titlebar would stay hidden after returning from a
  // view where it had been hidden.
  useEffect(() => {
    if (disableTitlebarAutoHide && isNoTitlebar) {
      if (titlebarHideTimeoutRef.current) {
        clearTimeout(titlebarHideTimeoutRef.current);
        titlebarHideTimeoutRef.current = null;
      }
      setIsTitlebarHovered(true);
    }
  }, [disableTitlebarAutoHide, isNoTitlebar]);

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

  // When auto-hide becomes active after a pinned state, let the currently
  // visible titlebar linger briefly and then hide.
  useEffect(() => {
    if (isNoTitlebar && !disableTitlebarAutoHide) {
      startTitlebarAutoHideTimer();
    }
  }, [isNoTitlebar, disableTitlebarAutoHide, startTitlebarAutoHideTimer]);

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
