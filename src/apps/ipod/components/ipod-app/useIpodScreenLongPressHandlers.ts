import type { MutableRefObject, MouseEvent, TouchEvent } from "react";

type LongPressRefs = {
  screenLongPressTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  screenLongPressFiredRef: MutableRefObject<boolean>;
  screenLongPressStartPos: MutableRefObject<{ x: number; y: number } | null>;
  SCREEN_LONG_PRESS_MOVE_THRESHOLD: number;
};

export function useIpodScreenLongPressHandlers(
  refs: LongPressRefs,
  handleCenterLongPress: () => void
) {
  const {
    screenLongPressTimerRef,
    screenLongPressFiredRef,
    screenLongPressStartPos,
    SCREEN_LONG_PRESS_MOVE_THRESHOLD,
  } = refs;

  const clearLongPressTimer = () => {
    if (screenLongPressTimerRef.current) {
      clearTimeout(screenLongPressTimerRef.current);
      screenLongPressTimerRef.current = null;
    }
    screenLongPressStartPos.current = null;
  };

  const startLongPress = (x: number, y: number) => {
    if (screenLongPressTimerRef.current) clearTimeout(screenLongPressTimerRef.current);
    screenLongPressFiredRef.current = false;
    screenLongPressStartPos.current = { x, y };
    screenLongPressTimerRef.current = setTimeout(() => {
      screenLongPressFiredRef.current = true;
      handleCenterLongPress();
    }, 500);
  };

  const checkMoveCancel = (x: number, y: number) => {
    if (screenLongPressStartPos.current && screenLongPressTimerRef.current) {
      const dx = x - screenLongPressStartPos.current.x;
      const dy = y - screenLongPressStartPos.current.y;
      if (
        Math.abs(dx) > SCREEN_LONG_PRESS_MOVE_THRESHOLD ||
        Math.abs(dy) > SCREEN_LONG_PRESS_MOVE_THRESHOLD
      ) {
        clearLongPressTimer();
      }
    }
  };

  return {
    onMouseDown: (e: MouseEvent) => startLongPress(e.clientX, e.clientY),
    onMouseMove: (e: MouseEvent) => checkMoveCancel(e.clientX, e.clientY),
    onMouseUp: clearLongPressTimer,
    onMouseLeave: clearLongPressTimer,
    onTouchStart: (e: TouchEvent) => {
      const touch = e.touches[0];
      startLongPress(touch.clientX, touch.clientY);
    },
    onTouchMove: (e: TouchEvent) => {
      const touch = e.touches[0];
      checkMoveCancel(touch.clientX, touch.clientY);
    },
    onTouchEnd: clearLongPressTimer,
    onTouchCancel: clearLongPressTimer,
  };
}
