import { type RefObject, useLayoutEffect, useRef } from "react";

/** Default pixels per hour in day/week time grids */
export const DEFAULT_TIME_GRID_HOUR_HEIGHT = 40;
export const TIME_GRID_HOUR_HEIGHT_MIN = 22;
export const TIME_GRID_HOUR_HEIGHT_MAX = 100;

const AXIS_LOCK_THRESHOLD_PX = 10;

type AxisLock = "none" | "h" | "v";

export type TimeScaleGesturesOptions = {
  /**
   * Week view: the outer `overflow-x-auto` element. Enables horizontal touch pan
   * (axis-locked vs vertical) and horizontal wheel/trackpad scrolling from the time grid.
   */
  horizontalScrollParentRef?: RefObject<HTMLElement | null>;
};

/**
 * Pinch-to-zoom and Ctrl/Cmd+wheel zoom for the calendar time scale (day/week).
 * Uses non-passive listeners so preventDefault works for trackpad pinch zoom.
 * Optional horizontal parent: locks single-finger drag to H or V after threshold, and
 * routes dominant horizontal wheel deltas to that parent.
 */
export function useTimeScaleGestures(
  scrollRef: RefObject<HTMLDivElement | null>,
  hourHeight: number,
  setHourHeight: (next: number) => void,
  options?: TimeScaleGesturesOptions,
) {
  const pinchRef = useRef<{ dist: number; startH: number } | null>(null);
  const panRef = useRef<{
    lock: AxisLock;
    startX: number;
    startY: number;
    startScrollLeft: number;
  } | null>(null);
  const hourHeightRef = useRef(hourHeight);
  hourHeightRef.current = hourHeight;

  const horizontalRef = options?.horizontalScrollParentRef;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const getHorizontal = () => horizontalRef?.current ?? null;

    const clamp = (v: number) =>
      Math.min(TIME_GRID_HOUR_HEIGHT_MAX, Math.max(TIME_GRID_HOUR_HEIGHT_MIN, v));

    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.008);
        const next = clamp(hourHeightRef.current * factor);
        if (next === hourHeightRef.current) return;
        hourHeightRef.current = next;
        setHourHeight(next);
        return;
      }

      const h = getHorizontal();
      if (!h) return;

      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.shiftKey && Math.abs(dy) >= Math.abs(dx)) {
        dx = dy;
        dy = 0;
      }
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX > absY && absX > 0) {
        e.preventDefault();
        h.scrollLeft += dx;
      }
    };

    const touchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        panRef.current = null;
        const a = e.touches[0];
        const b = e.touches[1];
        pinchRef.current = {
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          startH: hourHeightRef.current,
        };
        return;
      }
      if (e.touches.length === 1) {
        pinchRef.current = null;
        const t = e.touches[0];
        const h = getHorizontal();
        panRef.current = {
          lock: "none",
          startX: t.clientX,
          startY: t.clientY,
          startScrollLeft: h?.scrollLeft ?? 0,
        };
      }
    };

    const touchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const a = e.touches[0];
        const b = e.touches[1];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const scale = dist / pinchRef.current.dist;
        const next = clamp(pinchRef.current.startH * scale);
        if (next === hourHeightRef.current) return;
        hourHeightRef.current = next;
        setHourHeight(next);
        return;
      }

      if (e.touches.length !== 1 || !panRef.current) return;

      const h = getHorizontal();
      const t = e.touches[0];
      const dx = t.clientX - panRef.current.startX;
      const dy = t.clientY - panRef.current.startY;

      if (panRef.current.lock === "none") {
        if (Math.hypot(dx, dy) < AXIS_LOCK_THRESHOLD_PX) return;
        if (h) {
          panRef.current.lock = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        } else {
          panRef.current.lock = "v";
        }
      }

      if (panRef.current.lock === "h" && h) {
        e.preventDefault();
        h.scrollLeft = panRef.current.startScrollLeft - dx;
        return;
      }
      // lock === "v": native vertical scroll on `el`
    };

    const touchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
      if (e.touches.length === 0) panRef.current = null;
    };

    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchmove", touchMove, { passive: false });
    el.addEventListener("touchend", touchEnd);
    el.addEventListener("touchcancel", touchEnd);

    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchmove", touchMove);
      el.removeEventListener("touchend", touchEnd);
      el.removeEventListener("touchcancel", touchEnd);
    };
  }, [scrollRef, horizontalRef, setHourHeight]);
}
