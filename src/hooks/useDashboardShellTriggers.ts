import { useEffect } from "react";
import { useDashboardShellInputDisabled } from "@/hooks/useDashboardShellInputDisabled";
import { onExposeToggle, onSpotlightToggle } from "@/utils/appEventBus";
import { shouldEnableDashboardShellKeyboardTriggers } from "@/utils/dashboardShellGuards";

export type DashboardShellTriggerHandlers = {
  /** Toggle Dashboard (caller should close Expose first when opening via keyboard). */
  toggleDashboardFromKeyboard: () => void;
  closeDashboardIfOpen: () => void;
  toggleExposeFromKeyboard: () => void;
  toggleExposeFromEvent: () => void;
  toggleSpotlightFromKeyboard: () => void;
  closeOverlaysForSpotlightEvent: () => void;
};

/**
 * Registers global shell shortcuts for Dashboard, Expose, and Spotlight.
 * F4 Dashboard toggle is disabled on mobile / coarse pointer / compact viewports.
 * No hot-corner or corner-swipe Dashboard triggers exist in the shell today.
 */
export function useDashboardShellTriggers({
  toggleDashboardFromKeyboard,
  closeDashboardIfOpen,
  toggleExposeFromKeyboard,
  toggleExposeFromEvent,
  toggleSpotlightFromKeyboard,
  closeOverlaysForSpotlightEvent,
}: DashboardShellTriggerHandlers): void {
  const shellInputDisabled = useDashboardShellInputDisabled();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore stray function keys while typing in form controls (virtual keyboard / focus).
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      // F3 key to toggle Expose view (Mission Control)
      if (e.key === "F3" || (e.key === "f" && e.metaKey)) {
        e.preventDefault();
        closeDashboardIfOpen();
        toggleExposeFromKeyboard();
        return;
      }

      // F4 key to toggle Dashboard (desktop / non-touch-first only)
      if (e.key === "F4") {
        if (!shouldEnableDashboardShellKeyboardTriggers(shellInputDisabled)) {
          return;
        }
        e.preventDefault();
        toggleDashboardFromKeyboard();
        return;
      }

      // ⌘+Space / Ctrl+Space to toggle Spotlight Search
      if (e.key === " " && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSpotlightFromKeyboard();
      }
    };

    const unsubscribeExposeToggle = onExposeToggle(() => {
      closeDashboardIfOpen();
      toggleExposeFromEvent();
    });
    const unsubscribeSpotlightToggle = onSpotlightToggle(
      closeOverlaysForSpotlightEvent,
    );

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      unsubscribeExposeToggle();
      unsubscribeSpotlightToggle();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    shellInputDisabled,
    toggleDashboardFromKeyboard,
    closeDashboardIfOpen,
    toggleExposeFromKeyboard,
    toggleExposeFromEvent,
    toggleSpotlightFromKeyboard,
    closeOverlaysForSpotlightEvent,
  ]);
}
