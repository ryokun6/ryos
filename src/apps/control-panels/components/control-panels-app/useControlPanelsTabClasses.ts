import type { CSSProperties } from "react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { getTabStyles } from "@/utils/tabStyles";
import { cn } from "@/lib/utils";

export interface ControlPanelsTabClasses {
  /** Classes for the role="tablist" strip. */
  barClassName: string;
  /** Classes for each role="tab" button (reads data-state for active styling). */
  triggerClassName: string;
  /** Inline style for each trigger (Windows pixel font). */
  triggerStyle?: CSSProperties;
}

/**
 * Returns the tab strip / trigger classes for Control Panels preference panes,
 * mirroring the shared ThemedTabs (ThemedTabsList / ThemedTabsTrigger) styling
 * so the custom (always-mounted) pane tabs read native in every OS theme:
 *   - macOS Aqua  → global `aqua-tab` chrome (unchanged)
 *   - System 7    → getTabStyles() System 7 tabs (Geneva 12)
 *   - Windows XP/98 → white tabs with a black active tab + pixel font
 */
export function useControlPanelsTabClasses(): ControlPanelsTabClasses {
  const { currentTheme, isMacOSTheme, isWindowsTheme } = useThemeFlags();
  const tabStyles = getTabStyles(currentTheme);

  if (isMacOSTheme) {
    return { barClassName: "aqua-tab-bar", triggerClassName: "aqua-tab" };
  }

  if (isWindowsTheme) {
    // Windows XP / 98: render as native folder tabs. The visual chrome is
    // owned by control-panels-themed.css (targeting [role="tab"]) so it can
    // override the XP/98 library's raised `button` bevel; here we only supply
    // the pixel font so the labels match the rest of the OS.
    return {
      barClassName: "",
      triggerClassName: "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]",
      triggerStyle: {
        fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
        fontSize: "11px",
      },
    };
  }

  // System 7 (and any other non-mac, non-Windows theme).
  return {
    barClassName: tabStyles.tabListClasses,
    triggerClassName: cn(
      tabStyles.tabTriggerClasses,
      "px-4 py-1.5",
      "font-geneva-12 text-[12px]"
    ),
  };
}
