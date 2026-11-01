import { useEffect } from "react";
import { constrainOpenWindowsToViewport } from "@/stores/useAppStore";

/**
 * One viewport listener for every open window. Resize events are coalesced
 * to a single animation frame, then written as one store update.
 */
export function subscribeWindowViewportConstraints(
  onChange: () => void,
): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      onChange();
    });
  };

  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  const media = window.matchMedia?.("(hover: none) and (pointer: coarse)");
  media?.addEventListener("change", schedule);

  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
    media?.removeEventListener("change", schedule);
  };
}

export function useWindowViewportConstraints() {
  useEffect(
    () => subscribeWindowViewportConstraints(constrainOpenWindowsToViewport),
    [],
  );
}
