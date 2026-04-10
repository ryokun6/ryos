import type { CSSProperties } from "react";
import { OsThemeId } from "@/themes/types";

export interface TabStyleConfig {
  tabListClasses: string;
  tabTriggerClasses: string;
  tabContentClasses: string;
  separatorStyle: CSSProperties;
}

export function getTabStyles(currentTheme: OsThemeId): TabStyleConfig {
  const isMacOSXTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";

  const separatorColor = "var(--os-color-separator)";

  const tabListBase = `flex w-full ${
    isMacOSXTheme ? "" : "h-6"
  } space-x-0.5 shadow-none`;

  const tabListSystem7 = "bg-os-panel-bg border-b border-os-separator";
  const tabTriggerSystem7 =
    "bg-[#D4D4D4] data-[state=active]:bg-os-panel-bg border border-os-separator data-[state=active]:border-b-os-panel-bg";
  const tabContentSystem7 = "bg-os-panel-bg border border-t-0 border-os-separator";

  // macOS styling - use aqua-button CSS classes
  const tabListMacOSX = "aqua-tab-bar";
  const tabTriggerMacOSX = "aqua-tab";
  const tabContentMacOSX = "aqua-tab-content";

  const tabTriggerBase = `relative flex-1 ${isMacOSXTheme ? "" : "h-6"} px-2 ${
    isMacOSXTheme ? "" : "-mb-[1px]"
  } rounded-t shadow-none! text-[16px]`;
  const tabContentBase =
    "mt-0 min-w-0 max-w-full h-[calc(100%-2rem)] overflow-x-hidden";
  // Default content style (non-themed fallback) — kept separate to avoid
  // conflicting bg/border classes when a theme provides its own.
  const tabContentDefault = "bg-white border border-black/20";

  return {
    tabListClasses: `${tabListBase} ${
      isSystem7Theme ? tabListSystem7 : isMacOSXTheme ? tabListMacOSX : ""
    }`,
    tabTriggerClasses: `${tabTriggerBase} ${
      isSystem7Theme ? tabTriggerSystem7 : isMacOSXTheme ? tabTriggerMacOSX : ""
    }`,
    tabContentClasses: `${tabContentBase} ${
      isSystem7Theme
        ? tabContentSystem7
        : isMacOSXTheme
        ? tabContentMacOSX
        : tabContentDefault
    }`,
    separatorStyle: { borderColor: separatorColor },
  };
}

export function getWindowsLegacyTabMenuClasses() {
  return "h-7! flex justify-start! p-0 -mt-1 -mb-[2px] bg-transparent shadow-none /* Windows XP/98 tab strip */";
}
