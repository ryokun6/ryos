import { useMemo } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { getOsMacChrome, getOsPlatform, getThemeMetadata } from "@/themes";
import type { OsMacChrome, OsPlatform } from "@/themes/types";

export function useThemeFlags() {
  const currentTheme = useThemeStore((state) => state.current);
  const metadata = useMemo(() => getThemeMetadata(currentTheme), [currentTheme]);
  const osPlatform: OsPlatform = getOsPlatform(currentTheme);
  const macChrome: OsMacChrome | null = getOsMacChrome(currentTheme);

  const isWindowsTheme = metadata.isWindows;
  const isMacTheme = metadata.isMac;
  const isMacOSTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";
  const isWinXp = currentTheme === "xp";
  const isWin98 = currentTheme === "win98";
  const isXpTheme = isWindowsTheme;
  const isClassicTheme = isXpTheme || isSystem7Theme;
  /** Menu / menubar styling for Mac OS X Aqua only (not System 7). */
  const isAquaMenuChrome = isMacOSTheme;

  return {
    currentTheme,
    osPlatform,
    macChrome,
    isMacAquaChrome: macChrome === "aqua",
    metadata,
    isWindowsTheme,
    isMacTheme,
    isMacOSTheme,
    isSystem7Theme,
    isWinXp,
    isWin98,
    isXpTheme,
    isClassicTheme,
    isAquaMenuChrome,
  };
}
