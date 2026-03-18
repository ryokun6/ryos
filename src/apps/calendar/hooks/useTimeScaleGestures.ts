import { type RefObject, useLayoutEffect, useRef } from "react";

/** Default pixels per hour in day/week time grids */
export const DEFAULT_TIME_GRID_HOUR_HEIGHT = 40;
export const TIME_GRID_HOUR_HEIGHT_MIN = 22;
export const TIME_GRID_HOUR_HEIGHT_MAX = 100;

/**
 * Pinch-to-zoom and Ctrl/Cmd+wheel zoom for the calendar time scale (day/week).
 * Uses non-passive listeners so preventDefault works for trackpad pinch zoom.
 */
export function useTimeScaleGestures(
  scrollRef: RefObject<HTMLDivElement | null>,
  hourHeight: number,
  setHourHeight: (next: number) => void,
) {
  const pinchRef = useRef<{ dist: number; startH: number } | null>(null);
  const hourHeightRef = useRef(hourHeight);
  hourHeightRef.current = hourHeight;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const clamp = (v: number) =>
      Math.min(TIME_GRID_HOUR_HEIGHT_MAX, Math.max(TIME_GRID_HOUR_HEIGHT_MIN, v));

    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.008);
      const next = clamp(hourHeightRef.current * factor);
      if (next === hourHeightRef.current) return;
      hourHeightRef.current = next;
      setHourHeight(next);
    };

    const touchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        pinchRef.current = {
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          startH: hourHeightRef.current,
        };
      }
    };

    const touchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const a = e.touches[0];
      const b = e.touches[1];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const scale = dist / pinchRef.current.dist;
      const next = clamp(pinchRef.current.startH * scale);
      if (next === hourHeightRef.current) return;
      hourHeightRef.current = next;
      setHourHeight(next);
    };

    const clearPinch = () => {
      pinchRef.current = null;
    };

    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchmove", touchMove, { passive: false });
    el.addEventListener("touchend", clearPinch);
    el.addEventListener("touchcancel", clearPinch);

    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchmove", touchMove);
      el.removeEventListener("touchend", clearPinch);
      el.removeEventListener("touchcancel", clearPinch);
    };
  }, [scrollRef, setHourHeight]);
}
