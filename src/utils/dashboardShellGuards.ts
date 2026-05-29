/**
 * Shared guards for Dashboard shell triggers (F4, future hot corners / edge zones).
 * Intentional launches (dock icon, desktop shortcut, Spotlight) are unaffected.
 */

export type DashboardShellGuardSignals = {
  /** Touch and/or narrow layout — see useIsMobile. */
  isMobile: boolean;
  /** Viewport width under 768px or height under 520px (phone landscape). */
  isCompactViewport: boolean;
  /** Primary pointer is coarse (typical touch screens). */
  hasCoarsePointer: boolean;
  /** Device cannot hover (touch-first UIs). */
  hasHoverNone: boolean;
};

/** When true, disable accidental shell openers; keep explicit UI launch paths. */
export function shouldDisableDashboardAccidentalShellTriggers(
  signals: DashboardShellGuardSignals,
): boolean {
  if (signals.isMobile) return true;
  if (signals.isCompactViewport) return true;
  if (signals.hasCoarsePointer && signals.hasHoverNone) return true;
  return false;
}

export function shouldEnableDashboardShellKeyboardTriggers(
  shellInputDisabled: boolean,
): boolean {
  return !shellInputDisabled;
}
