import {
  PREVIEW_SCALE_FACTOR,
  PREVIEW_Y_SPACING,
  PREVIEW_Z_SPACING,
} from "./constants";

export const exitVariants = {
  exit: (direction: "forward" | "backward" | "none") => {
    if (direction === "backward") {
      return {
        opacity: 0,
        z: PREVIEW_Z_SPACING,
        scale: 1 - PREVIEW_SCALE_FACTOR,
        y: PREVIEW_Y_SPACING,
        transition: { type: "spring" as const, stiffness: 150, damping: 25 },
      };
    }
    return {
      opacity: 0,
      z: 50,
      scale: 1.05,
      y: -PREVIEW_Y_SPACING,
      transition: { type: "spring" as const, stiffness: 150, damping: 25 },
    };
  },
};

export const loadingBarVariants = {
  hidden: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.3 },
  },
  visible: {
    height: "0.25rem",
    opacity: 1,
    transition: { duration: 0.3 },
  },
};

export const pulsingAnimationVariants = {
  loading: {
    opacity: [0.4, 0.7, 0.4],
    transition: {
      duration: 2.5,
      ease: "easeInOut" as const,
      repeat: Infinity,
    },
  },
  loaded: {
    opacity: 1,
    transition: { duration: 0.5 },
  },
};
