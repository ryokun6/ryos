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

/**
 * Title-bar height per OS theme, used by the auto-resize body to convert the
 * measured content height into a total window height. Mirrors the table used by
 * Infinite Mac/PC window sizing. Aqua uses the 24px notitlebar spacer.
 */
export const CONTROL_PANELS_TITLEBAR_HEIGHT_BY_THEME: Record<string, number> = {
  macosx: CONTROL_PANELS_MACOSX_TITLEBAR_HEIGHT,
  system7: 24,
  xp: 30,
  win98: 22,
};

/** Fixed 28px in-window Windows menu bar plus its 1px bottom border. */
export const CONTROL_PANELS_WINDOWS_MENUBAR_HEIGHT = 29;

/** Resolve the title-bar height for a theme, falling back to the Aqua spacer. */
export function getControlPanelsTitlebarHeight(themeId: string): number {
  return (
    CONTROL_PANELS_TITLEBAR_HEIGHT_BY_THEME[themeId] ??
    CONTROL_PANELS_MACOSX_TITLEBAR_HEIGHT
  );
}

/** control-panels appRegistry windowConfig.maxSize.height */
export const CONTROL_PANELS_MAC_MAX_WINDOW_HEIGHT = 600;

/** Minimum macosx window height — keep in sync with windowConstraints.minHeight. */
export const CONTROL_PANELS_MAC_MIN_WINDOW_HEIGHT = 200;
