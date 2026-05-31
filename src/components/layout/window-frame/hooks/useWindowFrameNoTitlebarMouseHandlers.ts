import { useMemo } from "react";
import { isMouseEventFromLyrics } from "../windowFrameLyricsGuard";

export function useWindowFrameNoTitlebarMouseHandlers(
  isNoTitlebar: boolean,
  disableTitlebarAutoHide: boolean,
  showTitlebarWithAutoHide: () => void,
  hideTitlebar: () => void
) {
  return useMemo(() => {
    if (!isNoTitlebar || disableTitlebarAutoHide) {
      return {
        onMouseEnter: undefined,
        onMouseMove: undefined,
        onMouseLeave: undefined,
      };
    }

    const revealTitlebar = (e: React.MouseEvent<HTMLElement>) => {
      if (!isMouseEventFromLyrics(e.target)) {
        showTitlebarWithAutoHide();
      }
    };

    return {
      onMouseEnter: revealTitlebar,
      onMouseMove: revealTitlebar,
      onMouseLeave: hideTitlebar,
    };
  }, [
    isNoTitlebar,
    disableTitlebarAutoHide,
    showTitlebarWithAutoHide,
    hideTitlebar,
  ]);
}
