import {
  BASE_SHADOW,
  GLOW_SHADOW,
} from "./constants";

export const getVariants = (
  position: number,
  isAlternating: boolean,
  isCurrent: boolean,
  hasWordTiming: boolean = false,
  isOldSchoolKaraoke: boolean = false
) => {
  // For old-school karaoke, text-stroke is applied via inline styles (not animatable via variants)
  // For word-timed lines, glow is handled by the overlay layer
  // For other lines, apply glow at the parent level
  const getTextShadow = (isCurrentState: boolean) => {
    if (isOldSchoolKaraoke) {
      // Old-school uses -webkit-text-stroke, not text-shadow
      return "none";
    }
    // Default: current non-word-timed gets glow, others get base shadow
    return isCurrentState && !hasWordTiming ? GLOW_SHADOW : BASE_SHADOW;
  };
  
  // For lines with word timing, use subtle opacity fade for inactive lines
  // For non-word-timed lines, use normal opacity animation
  // For old-school karaoke, keep full opacity (outlines provide contrast)
  const getAnimateOpacity = () => {
    // Old-school karaoke: full opacity for all (outlines provide visibility)
    if (isOldSchoolKaraoke) return 1;
    
    // Alternating layout: less aggressive dimming
    if (isAlternating) return isCurrent ? 1 : 0.85;
    
    if (hasWordTiming) {
      // Word-timed lines: current at full, inactive more faded for focus effect
      if (isCurrent) return 1;
      // Past line (position -1) dimmer than next line (position 1)
      if (position === -1) return 0.7;
      if (position === 1) return 0.85;
      return 0.85;
    }
    // Non-word-timed lines: normal opacity animation
    if (isCurrent) return 1;
    // Past line dimmer than next line in FocusThree mode
    if (position === -1) return 0.5;
    if (position === 1) return 0.6;
    return 0.4;
  };

  // For word-timed lines, start at target opacity to avoid flash on entry
  const initialOpacity = hasWordTiming || isOldSchoolKaraoke ? getAnimateOpacity() : 0;
  
  return {
    initial: {
      opacity: initialOpacity,
      scale: 0.93,
      filter: "none",
      y: 10,
      textShadow: isOldSchoolKaraoke ? "none" : BASE_SHADOW,
    },
    animate: {
      opacity: getAnimateOpacity(),
      scale: isAlternating
        ? 1
        : isCurrent || position === 1 || position === -1
        ? 1
        : 0.9,
      filter: "none",
      y: 0,
      textShadow: getTextShadow(isCurrent),
    },
    exit: {
      opacity: 0,
      scale: 0.9,
      filter: "none",
      y: -10,
      textShadow: isOldSchoolKaraoke ? "none" : BASE_SHADOW,
    },
  };
};
