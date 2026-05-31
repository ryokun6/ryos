export const MAX_VISIBLE_PREVIEWS = 4;
export const PREVIEW_Z_SPACING = -80;
export const PREVIEW_SCALE_FACTOR = 0.05;
export const PREVIEW_Y_SPACING = -28;

export const appletIconStyles = `
  .applet-icon {
    font-size: 2.25rem !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
`;

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
