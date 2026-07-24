import {
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  CALENDAR_PERIOD_SWIPE_AXIS_LOCK_PX,
  CALENDAR_PERIOD_SWIPE_MIN_DISTANCE,
  resolveCalendarPeriodSwipe,
  shouldIgnoreCalendarPeriodSwipeTarget,
  type CalendarPeriodSwipeDirection,
} from "../utils/calendarPeriodSwipe";

export type UseCalendarPeriodSwipeOptions = {
  enabled?: boolean;
  onNavigate: (direction: CalendarPeriodSwipeDirection) => void;
  /**
   * Optional horizontal overflow parent (week view). Period swipes only fire
   * once that scroller is already at the matching edge.
   */
  horizontalScrollRef?: RefObject<HTMLElement | null>;
};

/**
 * Horizontal swipe-to-navigate for calendar day/week/month periods.
 * Axis-locks after a small threshold so vertical time-grid scrolling stays native.
 * Returns a drag offset (px) for light visual feedback while swiping.
 */
export function useCalendarPeriodSwipe(
  containerRef: RefObject<HTMLElement | null>,
  { enabled = true, onNavigate, horizontalScrollRef }: UseCalendarPeriodSwipeOptions
): { swipeOffsetX: number; isSwiping: boolean } {
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const panRef = useRef<{
    startX: number;
    startY: number;
    lock: "none" | "h" | "v";
    ignored: boolean;
    startScrollLeft: number;
    maxScrollLeft: number;
  } | null>(null);

  const onNavigateEvent = useEffectEvent(onNavigate);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) {
      setSwipeOffsetX(0);
      setIsSwiping(false);
      return;
    }

    const readHorizontalScroll = () => {
      const h = horizontalScrollRef?.current;
      if (!h) {
        return { scrollLeft: undefined, maxScrollLeft: undefined };
      }
      const maxScrollLeft = Math.max(0, h.scrollWidth - h.clientWidth);
      return { scrollLeft: h.scrollLeft, maxScrollLeft };
    };

    const touchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        panRef.current = null;
        setSwipeOffsetX(0);
        setIsSwiping(false);
        return;
      }
      const t = e.touches[0];
      const { scrollLeft, maxScrollLeft } = readHorizontalScroll();
      panRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        lock: "none",
        ignored: shouldIgnoreCalendarPeriodSwipeTarget(e.target),
        startScrollLeft: scrollLeft ?? 0,
        maxScrollLeft: maxScrollLeft ?? 0,
      };
    };

    const touchMove = (e: TouchEvent) => {
      const pan = panRef.current;
      if (!pan || pan.ignored || e.touches.length !== 1) return;

      const t = e.touches[0];
      const dx = t.clientX - pan.startX;
      const dy = t.clientY - pan.startY;

      if (pan.lock === "none") {
        if (Math.hypot(dx, dy) < CALENDAR_PERIOD_SWIPE_AXIS_LOCK_PX) return;
        pan.lock = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (pan.lock === "v") {
          setSwipeOffsetX(0);
          setIsSwiping(false);
          return;
        }
        setIsSwiping(true);
      }

      if (pan.lock !== "h") return;

      const hasHorizontalParent = Boolean(horizontalScrollRef?.current);
      // Preview with a synthetic distance so edge-gated week pans don't flash
      // feedback while the horizontal scroller still has room to move.
      const canNavigate = resolveCalendarPeriodSwipe({
        deltaX:
          dx === 0
            ? 0
            : dx < 0
              ? -CALENDAR_PERIOD_SWIPE_MIN_DISTANCE
              : CALENDAR_PERIOD_SWIPE_MIN_DISTANCE,
        deltaY: 0,
        scrollLeft: hasHorizontalParent ? pan.startScrollLeft : undefined,
        maxScrollLeft: hasHorizontalParent ? pan.maxScrollLeft : undefined,
      });
      if (!canNavigate) {
        setSwipeOffsetX(0);
        return;
      }

      // Light rubber-band feedback; clamp so it never feels like free drag.
      const feedback = Math.max(-72, Math.min(72, dx * 0.35));
      setSwipeOffsetX(feedback);
    };

    const finish = (e: TouchEvent) => {
      const pan = panRef.current;
      panRef.current = null;
      setSwipeOffsetX(0);
      setIsSwiping(false);
      if (!pan || pan.ignored || pan.lock !== "h") return;
      if (e.changedTouches.length === 0) return;

      const t = e.changedTouches[0];
      const deltaX = t.clientX - pan.startX;
      const deltaY = t.clientY - pan.startY;
      const hasHorizontalParent = Boolean(horizontalScrollRef?.current);

      const direction = resolveCalendarPeriodSwipe({
        deltaX,
        deltaY,
        scrollLeft: hasHorizontalParent ? pan.startScrollLeft : undefined,
        maxScrollLeft: hasHorizontalParent ? pan.maxScrollLeft : undefined,
      });
      if (direction) onNavigateEvent(direction);
    };

    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchmove", touchMove, { passive: true });
    el.addEventListener("touchend", finish, { passive: true });
    el.addEventListener("touchcancel", finish, { passive: true });

    return () => {
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchmove", touchMove);
      el.removeEventListener("touchend", finish);
      el.removeEventListener("touchcancel", finish);
    };
  }, [containerRef, enabled, horizontalScrollRef]);

  return { swipeOffsetX, isSwiping };
}
