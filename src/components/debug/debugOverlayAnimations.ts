import type { TargetAndTransition, Transition } from "motion/react";

const OPEN_EASE = [0.33, 1, 0.68, 1] as const;
const CLOSE_EASE = [0.32, 0, 0.67, 0] as const;

export type DebugPanelAnchor = "left" | "right";

export function getDebugPanelTransformOrigin(
  anchor: DebugPanelAnchor
): "bottom left" | "bottom right" {
  return anchor === "right" ? "bottom right" : "bottom left";
}

export function getDebugPanelMotionProps(params: {
  prefersReducedMotion: boolean;
}): {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
  transition: Transition;
} {
  if (params.prefersReducedMotion) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: { opacity: 0, scale: 0.95, y: 8 },
    animate: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { duration: 0.2, ease: OPEN_EASE },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: 8,
      transition: { duration: 0.2, ease: CLOSE_EASE },
    },
    transition: { duration: 0.2, ease: OPEN_EASE },
  };
}
