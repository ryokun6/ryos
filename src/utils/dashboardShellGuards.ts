/**
 * Shared guards for Dashboard shell triggers (F4, hot corners / edge zones).
 * Intentional launches (dock icon, desktop shortcut, Spotlight) are unaffected.
 */

export type DashboardShellGuardSignals = {
  /** Touch and/or narrow layout — see useIsMobile / collectDashboardShellGuardSignals. */
  isMobile: boolean;
  /** Viewport width under 768px or height under 520px (phone landscape). */
  isCompactViewport: boolean;
  /** Primary pointer is coarse (typical touch screens). */
  hasCoarsePointer: boolean;
  /** Device cannot hover (touch-first UIs). */
  hasHoverNone: boolean;
};

/** Read current viewport/pointer signals (safe for keydown/pointer handlers). */
export function collectDashboardShellGuardSignals(): DashboardShellGuardSignals {
  if (typeof window === "undefined") {
    return {
      isMobile: false,
      isCompactViewport: false,
      hasCoarsePointer: false,
      hasHoverNone: false,
    };
  }

  const hasTouchScreen =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isNarrowWidth = window.innerWidth < 768;
  const isCompactHeight = window.innerHeight < 520;

  return {
    isMobile: hasTouchScreen || isNarrowWidth,
    isCompactViewport: isNarrowWidth || isCompactHeight,
    hasCoarsePointer: window.matchMedia("(pointer: coarse)").matches,
    hasHoverNone: window.matchMedia("(hover: none)").matches,
  };
}

/**
 * When true, disable accidental shell openers (F4, edge/corner gestures); keep explicit UI launch paths.
 * Mobile gesture Dashboard opens are disabled because F4 misfires on virtual keyboards, bottom-edge
 * touches are common on Android, and System 7 / hidden-dock layouts have no stable hot-corner target.
 */
export function shouldDisableDashboardAccidentalShellTriggers(
  signals: DashboardShellGuardSignals,
): boolean {
  if (signals.isMobile) return true;
  if (signals.isCompactViewport) return true;
  if (signals.hasCoarsePointer) return true;
  return false;
}

export function shouldEnableDashboardShellKeyboardTriggers(
  shellInputDisabled: boolean,
): boolean {
  return !shellInputDisabled;
}

/** Hidden dock should use swipe-up reveal (not a hover capture zone) on touch-first viewports. */
export function shouldUseDockSwipeReveal(
  signals: DashboardShellGuardSignals,
): boolean {
  return shouldDisableDashboardAccidentalShellTriggers(signals);
}
