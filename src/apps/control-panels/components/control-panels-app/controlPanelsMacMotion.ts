import type { Transition } from "motion/react";

/**
 * Programmatic window/content resize — matches WindowFrame when not dragging
 * (same easing as PC emulator preset grid ↔ emulator screen resize).
 */
export const CONTROL_PANELS_MAC_SIZE_TRANSITION: Transition = {
  duration: 0.15,
  ease: [0.25, 0.1, 0.25, 1],
};

/** macosx notitlebar spacer in WindowFrame / themes.css */
export const CONTROL_PANELS_MACOSX_TITLEBAR_HEIGHT = 24;

/** control-panels appRegistry windowConfig.maxSize.height */
export const CONTROL_PANELS_MAC_MAX_WINDOW_HEIGHT = 600;

/** Minimum macosx window height — keep in sync with windowConstraints.minHeight. */
export const CONTROL_PANELS_MAC_MIN_WINDOW_HEIGHT = 200;
