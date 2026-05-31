import type { Transition } from "framer-motion";

// Hoisted transition / animation prop objects so the LCD widgets don't
// receive freshly-allocated framer-motion props on every parent render
// (TvAppComponent re-renders on each onProgress tick). Reusing the same
// references lets framer-motion bail out of unnecessary diff work.
export const SPRING_TRANSITION: Transition = {
  y: { type: "spring", stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
};

export const STATIC_TRANSITION: Transition = { duration: 0.3 };

export const MARQUEE_TITLE_TRANSITION: Transition = {
  duration: 20,
  ease: "linear",
  repeat: Infinity,
  repeatType: "loop",
};

export const MARQUEE_NAME_TRANSITION: Transition = {
  duration: 8,
  ease: "linear",
  repeat: Infinity,
  repeatType: "loop",
};

export const STATUS_FADE_TRANSITION: Transition = { duration: 0.2 };

export const STATUS_TEXT_STROKE_STYLE: React.CSSProperties = {
  WebkitTextStroke: "3px black",
  textShadow: "none",
};

// Stable framer-motion target objects for marquee variants. Kept at
// module scope so `motion.div` doesn't see a "new" prop reference each
// time the parent (TvAppComponent) re-renders for an unrelated state
// change like onProgress.
export const MARQUEE_INITIAL = { x: "0%" } as const;
export const MARQUEE_TITLE_ANIMATE = { x: "-100%" } as const;
export const MARQUEE_TITLE_ANIMATE_STATIC = { x: "0%" } as const;

export const STATUS_OPACITY_INITIAL = { opacity: 0 } as const;
export const STATUS_OPACITY_ANIMATE = { opacity: 1 } as const;

// Right-edge fade applied to LCD marquees that are overflowing but not
// actively scrolling (e.g. when playback is paused). Uses mask-image so
// the fade is theme-agnostic — transparent at the right edge regardless
// of the LCD background color (black on most themes, sage green on
// macOS X).
export const STATIC_OVERFLOW_MASK_STYLE: React.CSSProperties = {
  maskImage:
    "linear-gradient(to right, black calc(100% - 32px), transparent)",
  WebkitMaskImage:
    "linear-gradient(to right, black calc(100% - 32px), transparent)",
};
