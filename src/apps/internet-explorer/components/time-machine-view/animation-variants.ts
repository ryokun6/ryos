import {
  PREVIEW_SCALE_FACTOR,
  PREVIEW_Y_SPACING,
  PREVIEW_Z_SPACING,
} from "./constants";

export const exitVariants = {
    // Define a single 'exit' variant as a function accepting the custom prop
    exit: (direction: "forward" | "backward" | "none") => {
      if (direction === "backward") {
        // Changed from 'forward' to 'backward'
        // Backward exit (going to future): Exiting card moves smoothly back to the distance=1 position
        return {
          opacity: 0, // Fade out smoothly
          z: PREVIEW_Z_SPACING, // Target z for distance = 1
          scale: 1 - PREVIEW_SCALE_FACTOR, // Target scale for distance = 1
          y: PREVIEW_Y_SPACING, // Target y for distance = 1
          transition: { type: "spring" as const, stiffness: 150, damping: 25 },
        };
      } else {
        // direction === 'forward' or 'none'
        // Forward exit (going to past): Exiting card scales *out* (up and forward)
        return {
          opacity: 0,
          z: 50, // Bring slightly forward
          scale: 1.05, // Scale up a bit
          y: -PREVIEW_Y_SPACING, // Subtle upward shift
          transition: { type: "spring" as const, stiffness: 150, damping: 25 },
        };
      }
    },
    /* Original approach - keeping for reference if needed
       opacity: 0,
       z: (MAX_VISIBLE_PREVIEWS + 1) * PREVIEW_Z_SPACING,
       scale: 1 - (MAX_VISIBLE_PREVIEWS + 1) * PREVIEW_SCALE_FACTOR,
       y: (MAX_VISIBLE_PREVIEWS + 1) * PREVIEW_Y_SPACING,
       transition: { type: 'spring', stiffness: 150, damping: 25 } // Smoothed damping
     },
     scaleUp: { // New exit: card moves towards user/scales up when navigating forward (older)
       opacity: 0,
       z: 50, // Bring slightly forward
       scale: 1.05, // Scale up a bit
       y: 0,
       transition: { type: 'spring', stiffness: 150, damping: 25 } // Smoothed damping
     }
    */
  };
  // --- End Animation Variants ---

  // Calculate tooltip labels
  const olderYearLabel =
    activeYearIndex < cachedYears.length - 1
      ? cachedYears[activeYearIndex + 1]
      : t("apps.internet-explorer.oldest");
  const newerYearLabel =
    activeYearIndex > 0 ? cachedYears[activeYearIndex - 1] : t("apps.internet-explorer.newest");

  // --- Calculate the slice of years to actually render ---
  const startIndex = Math.max(0, activeYearIndex); // The active card is the first one we want
  // +1 because slice end is exclusive, +1 again because MAX_VISIBLE_PREVIEWS is *behind* active
  const endIndexExclusive = Math.min(
    cachedYears.length,
    activeYearIndex + MAX_VISIBLE_PREVIEWS + 1
  );
  const visibleYears = cachedYears.slice(startIndex, endIndexExclusive);
  // --- End Slice Calculation ---

  // Loading bar animation variants
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

  // Pulsing animation variants for loading content
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
