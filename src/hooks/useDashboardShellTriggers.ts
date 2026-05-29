import { useEffect } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { onExposeToggle, onSpotlightToggle } from "@/utils/appEventBus";

export type DashboardShellTriggerHandlers = {
  /** Toggle Dashboard (caller should close Expose first when opening via keyboard). */
  toggleDashboardFromKeyboard: () => void;
  closeDashboardIfOpen: () => void;
  toggleExposeFromKeyboard: () => void;
  toggleExposeFromEvent: () => void;
  toggleSpotlightFromKeyboard: () => void;
  closeOverlaysForSpotlightEvent: () => void;
};

/** F4 Dashboard shortcut is desktop-only; no corner/gesture shell triggers on mobile. */
export function shouldEnableDashboardShellKeyboardTriggers(isMobile: boolean): boolean {
  return !isMobile;
}

/**
 * Registers global shell shortcuts for Dashboard, Expose, and Spotlight.
 * F4 Dashboard toggle is disabled on mobile (touch / narrow viewports).
 */
export function useDashboardShellTriggers({
  toggleDashboardFromKeyboard,
  closeDashboardIfOpen,
  toggleExposeFromKeyboard,
  toggleExposeFromEvent,
  toggleSpotlightFromKeyboard,
  closeOverlaysForSpotlightEvent,
}: DashboardShellTriggerHandlers): void {
  const isMobile = useIsMobile();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F3 key to toggle Expose view (Mission Control)
      if (e.key === "F3" || (e.key === "f" && e.metaKey)) {
        e.preventDefault();
        closeDashboardIfOpen();
        toggleExposeFromKeyboard();
        return;
      }

      // F4 key to toggle Dashboard (desktop / non-mobile only)
      if (e.key === "F4") {
        if (!shouldEnableDashboardShellKeyboardTriggers(isMobile)) {
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
      closeOverlaysForSpotlightEvent
    );

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      unsubscribeExposeToggle();
      unsubscribeSpotlightToggle();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isMobile,
    toggleDashboardFromKeyboard,
    closeDashboardIfOpen,
    toggleExposeFromKeyboard,
    toggleExposeFromEvent,
    toggleSpotlightFromKeyboard,
    closeOverlaysForSpotlightEvent,
  ]);
}
