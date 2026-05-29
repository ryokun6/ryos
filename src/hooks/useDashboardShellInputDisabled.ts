import { useIsMobile } from "@/hooks/useIsMobile";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  collectDashboardShellGuardSignals,
  shouldDisableDashboardAccidentalShellTriggers,
} from "@/utils/dashboardShellGuards";

/**
 * True when Dashboard shell shortcuts / edge triggers should not fire accidentally
 * (mobile, coarse pointer, or compact viewport). Dock and desktop icons still work.
 */
export function useDashboardShellInputDisabled(): boolean {
  const isMobile = useIsMobile();
  const hasCoarsePointer = useMediaQuery("(pointer: coarse)");
  const hasHoverNone = useMediaQuery("(hover: none)");
  const isNarrowWidth = useMediaQuery("(max-width: 767px)");
  const isCompactHeight = useMediaQuery("(max-height: 520px)");

  return shouldDisableDashboardAccidentalShellTriggers({
    isMobile,
    hasCoarsePointer,
    hasHoverNone,
    isCompactViewport: isNarrowWidth || isCompactHeight,
  });
}

/** Synchronous guard for event handlers (avoids stale hook snapshot on keydown). */
export function isDashboardShellInputDisabledNow(): boolean {
  return shouldDisableDashboardAccidentalShellTriggers(
    collectDashboardShellGuardSignals(),
  );
}
