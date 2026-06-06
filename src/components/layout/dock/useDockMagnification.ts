import { useEffect, useState } from "react";
import { useMotionValue } from "motion/react";

/**
 * Dock bar magnification: tracks pointer X and respects touch/hover capability
 * plus user preference and resize state.
 */
export function useDockMagnification(
  dockMagnification: boolean,
  isResizing: boolean,
) {
  const mouseX = useMotionValue<number>(Infinity);
  const [magnifyEnabled, setMagnifyEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setMagnifyEnabled(true);
      return;
    }

    const mqlPointerCoarse = window.matchMedia("(pointer: coarse)");
    const mqlHoverNone = window.matchMedia("(hover: none)");
    const compute = () => {
      const coarse = mqlPointerCoarse.matches;
      const noHover = mqlHoverNone.matches;
      setMagnifyEnabled(!(coarse || noHover));
    };
    compute();

    const onChange = () => compute();

    const legacyPointerListener = () => onChange();
    const legacyHoverListener = () => onChange();

    if (typeof mqlPointerCoarse.addEventListener === "function") {
      mqlPointerCoarse.addEventListener("change", onChange as EventListener);
    } else if (typeof mqlPointerCoarse.addListener === "function") {
      mqlPointerCoarse.addListener(legacyPointerListener);
    }

    if (typeof mqlHoverNone.addEventListener === "function") {
      mqlHoverNone.addEventListener("change", onChange as EventListener);
    } else if (typeof mqlHoverNone.addListener === "function") {
      mqlHoverNone.addListener(legacyHoverListener);
    }

    return () => {
      if (typeof mqlPointerCoarse.removeEventListener === "function") {
        mqlPointerCoarse.removeEventListener("change", onChange as EventListener);
      } else if (typeof mqlPointerCoarse.removeListener === "function") {
        mqlPointerCoarse.removeListener(legacyPointerListener);
      }

      if (typeof mqlHoverNone.removeEventListener === "function") {
        mqlHoverNone.removeEventListener("change", onChange as EventListener);
      } else if (typeof mqlHoverNone.removeListener === "function") {
        mqlHoverNone.removeListener(legacyHoverListener);
      }
    };
  }, []);

  const effectiveMagnifyEnabled =
    magnifyEnabled && !isResizing && dockMagnification;

  useEffect(() => {
    if (!effectiveMagnifyEnabled) mouseX.set(Infinity);
  }, [effectiveMagnifyEnabled, mouseX]);

  return { mouseX, effectiveMagnifyEnabled };
}
