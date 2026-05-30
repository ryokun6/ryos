import { useCallback, useRef } from "react";

const DEFAULT_DELAY_MS = 500;
const DEFAULT_MOVE_THRESHOLD_PX = 10;

export type PointerLongPressBindings = {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  /** Returns true once after a long press so click handlers can skip. */
  consumeClickIfLongPressFired: () => boolean;
};

/**
 * Long-press for mouse and touch with movement cancellation.
 * Use `consumeClickIfLongPressFired` in click handlers to avoid accidental taps.
 */
export function usePointerLongPress(
  onLongPress: () => void,
  {
    delay = DEFAULT_DELAY_MS,
    moveThreshold = DEFAULT_MOVE_THRESHOLD_PX,
    enabled = true,
    shouldIgnoreTarget,
  }: {
    delay?: number;
    moveThreshold?: number;
    enabled?: boolean;
    shouldIgnoreTarget?: (target: EventTarget | null) => boolean;
  } = {}
): PointerLongPressBindings {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearTimer();
    startPosRef.current = null;
  }, [clearTimer]);

  const isIgnored = useCallback(
    (target: EventTarget | null) => !enabled || shouldIgnoreTarget?.(target),
    [enabled, shouldIgnoreTarget]
  );

  const start = useCallback(
    (x: number, y: number, target: EventTarget | null) => {
      if (isIgnored(target)) return;
      clearTimer();
      firedRef.current = false;
      startPosRef.current = { x, y };
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress();
      }, delay);
    },
    [clearTimer, delay, isIgnored, onLongPress]
  );

  const checkMoveCancel = useCallback(
    (x: number, y: number) => {
      if (!startPosRef.current || !timerRef.current) return;
      const dx = x - startPosRef.current.x;
      const dy = y - startPosRef.current.y;
      if (
        Math.abs(dx) > moveThreshold ||
        Math.abs(dy) > moveThreshold
      ) {
        cancel();
      }
    },
    [cancel, moveThreshold]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isIgnored(e.target)) return;
      start(e.clientX, e.clientY, e.target);
    },
    [isIgnored, start]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      checkMoveCancel(e.clientX, e.clientY);
    },
    [checkMoveCancel]
  );

  const onMouseUp = useCallback(() => {
    cancel();
  }, [cancel]);

  const onMouseLeave = useCallback(() => {
    cancel();
  }, [cancel]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isIgnored(e.target)) return;
      const touch = e.touches[0];
      if (!touch) return;
      start(touch.clientX, touch.clientY, e.target);
    },
    [isIgnored, start]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      checkMoveCancel(touch.clientX, touch.clientY);
    },
    [checkMoveCancel]
  );

  const onTouchEnd = useCallback(() => {
    cancel();
  }, [cancel]);

  const onTouchCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  const consumeClickIfLongPressFired = useCallback(() => {
    if (!firedRef.current) return false;
    firedRef.current = false;
    return true;
  }, []);

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    consumeClickIfLongPressFired,
  };
}
