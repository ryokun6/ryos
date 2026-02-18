import { OsThemeId } from "@/themes/types";

export interface TabStyleConfig {
  tabListClasses: string;
  tabTriggerClasses: string;
  tabContentClasses: string;
  separatorStyle: React.CSSProperties;
}

export function getTabStyles(currentTheme: OsThemeId): TabStyleConfig {
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOSXTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";
  const isWindowsLegacyTheme = isXpTheme;

  const separatorColor = isMacOSXTheme
    ? "rgba(0, 0, 0, 0.2)"
    : isSystem7Theme || isWindowsLegacyTheme
    ? "#808080"
    : "rgba(0, 0, 0, 0.2)";

  const tabListBase = `flex w-full ${
    isMacOSXTheme ? "" : "h-6"
  } space-x-0.5 shadow-none`;

  // System 7 styling - classic, no gradients or gloss
  const tabListSystem7 = "bg-[#E3E3E3] border-b border-[#808080]";
  const tabTriggerSystem7 =
    "bg-[#D4D4D4] data-[state=active]:bg-[#E3E3E3] border border-[#808080] data-[state=active]:border-b-[#E3E3E3]";
  const tabContentSystem7 = "bg-[#E3E3E3] border border-t-0 border-[#808080]";

  // macOS styling - use aqua-button CSS classes
  const tabListMacOSX = "aqua-tab-bar";
  const tabTriggerMacOSX = "aqua-tab";
  const tabContentMacOSX = "aqua-tab-content";

  const tabTriggerBase = `relative flex-1 ${isMacOSXTheme ? "" : "h-6"} px-2 ${
    isMacOSXTheme ? "" : "-mb-[1px]"
  } rounded-t shadow-none! text-[16px]`;
  const tabContentBase = "mt-0 h-[calc(100%-2rem)]";
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
