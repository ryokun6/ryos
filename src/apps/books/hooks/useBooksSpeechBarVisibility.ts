import { useCallback, useEffect, useRef, useState } from "react";

export const BOOKS_SPEECH_BAR_TOUCH_OPEN_MS = 3000;
/** How long the bar stays open when auto-revealed on book load. */
export const BOOKS_SPEECH_BAR_AUTO_REVEAL_MS = 2000;

const BOOKS_SPEECH_BAR_POINTER_EXIT_MS = 160;
const HOVER_POINTER_TYPE = "mouse";

interface UseBooksSpeechBarVisibilityOptions {
  isPlaying: boolean;
}

interface BooksSpeechBarVisibility {
  isOpen: boolean;
  handlePointerEnter: (pointerType: string) => void;
  handlePointerLeave: (pointerType: string) => void;
  handlePointerDown: (pointerType: string) => void;
  handleFocus: () => void;
  handleBlur: () => void;
  revealTemporarily: (durationMs?: number) => void;
}

export function useBooksSpeechBarVisibility({
  isPlaying,
}: UseBooksSpeechBarVisibilityOptions): BooksSpeechBarVisibility {
  const [isExpanded, setIsExpanded] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  const isMouseInsideRef = useRef(false);
  const hasFocusInsideRef = useRef(false);
  const hasTemporaryTouchHoldRef = useRef(false);
  const collapseTimerRef = useRef<number | null>(null);
  isPlayingRef.current = isPlaying;

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current === null) return;
    window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  }, []);

  const collapse = useCallback(() => {
    clearCollapseTimer();
    hasTemporaryTouchHoldRef.current = false;
    setIsExpanded(false);
  }, [clearCollapseTimer]);

  const expand = useCallback(() => {
    clearCollapseTimer();
    hasTemporaryTouchHoldRef.current = false;
    setIsExpanded(true);
  }, [clearCollapseTimer]);

  const scheduleCollapse = useCallback(
    (delayMs: number) => {
      clearCollapseTimer();
      hasTemporaryTouchHoldRef.current = false;
      collapseTimerRef.current = window.setTimeout(() => {
        collapseTimerRef.current = null;
        if (
          isPlayingRef.current ||
          isMouseInsideRef.current ||
          hasFocusInsideRef.current
        ) {
          return;
        }
        setIsExpanded(false);
      }, delayMs);
    },
    [clearCollapseTimer]
  );

  const revealTemporarily = useCallback(
    (durationMs: number = BOOKS_SPEECH_BAR_TOUCH_OPEN_MS) => {
      clearCollapseTimer();
      hasTemporaryTouchHoldRef.current = true;
      setIsExpanded(true);
      collapseTimerRef.current = window.setTimeout(() => {
        collapseTimerRef.current = null;
        hasTemporaryTouchHoldRef.current = false;
        if (
          isPlayingRef.current ||
          isMouseInsideRef.current ||
          hasFocusInsideRef.current
        ) {
          return;
        }
        setIsExpanded(false);
      }, durationMs);
    },
    [clearCollapseTimer]
  );

  const handlePointerEnter = useCallback(
    (pointerType: string) => {
      if (pointerType !== HOVER_POINTER_TYPE) return;
      isMouseInsideRef.current = true;
      expand();
    },
    [expand]
  );

  const handlePointerLeave = useCallback(
    (pointerType: string) => {
      if (pointerType !== HOVER_POINTER_TYPE) return;
      isMouseInsideRef.current = false;
      scheduleCollapse(BOOKS_SPEECH_BAR_POINTER_EXIT_MS);
    },
    [scheduleCollapse]
  );

  const handlePointerDown = useCallback(
    (pointerType: string) => {
      if (pointerType === HOVER_POINTER_TYPE) return;
      revealTemporarily();
    },
    [revealTemporarily]
  );

  const handleFocus = useCallback(() => {
    hasFocusInsideRef.current = true;
    expand();
  }, [expand]);

  const handleBlur = useCallback(() => {
    hasFocusInsideRef.current = false;
    scheduleCollapse(BOOKS_SPEECH_BAR_POINTER_EXIT_MS);
  }, [scheduleCollapse]);

  useEffect(() => {
    if (isPlaying) {
      expand();
      return;
    }
    if (
      !isMouseInsideRef.current &&
      !hasFocusInsideRef.current &&
      !hasTemporaryTouchHoldRef.current
    ) {
      collapse();
    }
  }, [collapse, expand, isPlaying]);

  useEffect(
    () => () => {
      clearCollapseTimer();
    },
    [clearCollapseTimer]
  );

  return {
    isOpen: isPlaying || isExpanded,
    handlePointerEnter,
    handlePointerLeave,
    handlePointerDown,
    handleFocus,
    handleBlur,
    revealTemporarily,
  };
}
