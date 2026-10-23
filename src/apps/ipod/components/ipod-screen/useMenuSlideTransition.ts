import { useMemo, useRef, useState, useEffect } from "react";
import {
  estimateSlidePercent,
  menuSlideDurationMs,
  menuSlideEase,
} from "../../utils/wheelGesture";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export type MenuSlideCustom = {
  direction: "forward" | "backward";
  fromPercent: number;
};

type Flight = {
  fromPercent: number;
  toPercent: number;
  startedAt: number;
  durationMs: number;
};

/**
 * Full-width menu travel is 240ms. A reversal that starts before the
 * previous slide has settled continues from the estimated translate, so
 * the duration stays proportional to the remaining distance.
 */
export function useMenuSlideTransition(
  direction: "forward" | "backward",
  generation: string,
  reducedMotion: boolean
): { custom: MenuSlideCustom; transition: { duration: number; ease: [number, number, number, number] } } {
  const flightRef = useRef<Flight | null>(null);

  return useMemo(() => {
    const now = Date.now();
    const rtl =
      typeof document !== "undefined" && document.documentElement.dir === "rtl";
    const edge = (direction === "forward" ? 100 : -100) * (rtl ? -1 : 1);
    const previous = flightRef.current;
    let fromPercent = edge;
    let reversing = false;
    if (previous && previous.durationMs > 0) {
      const current = estimateSlidePercent({ ...previous, now });
      const settled =
        now - previous.startedAt >= previous.durationMs ||
        Math.abs(current - previous.toPercent) < 0.5;
      if (!settled) {
        fromPercent = current;
        const previousTravel = previous.toPercent - previous.fromPercent;
        const nextTravel = -current;
        reversing =
          previousTravel !== 0 && Math.sign(nextTravel) !== Math.sign(previousTravel);
      }
    }
    const durationMs = menuSlideDurationMs({
      reducedMotion,
      fromPercent,
      toPercent: 0,
    });
    flightRef.current = {
      fromPercent,
      toPercent: 0,
      startedAt: now,
      durationMs,
    };
    return {
      custom: { direction, fromPercent },
      transition: {
        duration: durationMs / 1000,
        ease: menuSlideEase(reversing),
      },
    };
    // generation changes when the visible menu page changes.
  }, [direction, generation, reducedMotion]);
}
