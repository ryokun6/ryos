import { useMemo } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import type { DarkModePreference } from "@/stores/useThemeStore";
import { getOsMacChrome, getOsPlatform, getThemeMetadata } from "@/themes";
import type { OsMacChrome, OsPlatform } from "@/themes/types";
import { DEFAULT_ACCENT, type AccentId } from "@/themes/accents";

export function useThemeFlags() {
  const currentTheme = useThemeStore((state) => state.current);
  const isDark = useThemeStore((state) => state.isDark);
  const darkModePreference: DarkModePreference = useThemeStore(
    (state) => state.darkModeByTheme[state.current] ?? "system"
  );
  const accent: AccentId = useThemeStore(
    (state) => state.accentByTheme[state.current] ?? DEFAULT_ACCENT
  );
  const aquaMaterial = useThemeStore((state) => state.aquaMaterial);
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
  const supportsDarkMode = metadata.supportsDarkMode;
  /** True only when dark mode is both supported by the active theme AND enabled. */
  const isDarkMode = supportsDarkMode && isDark;
  /** Only the classic Mac chromes (Aqua + System 7) expose an accent picker. */
  const supportsAccent = macChrome !== null;
  /** True when the Aqua "glass" material is active (only meaningful for macosx). */
  const isAquaGlass = isMacOSTheme && aquaMaterial === "glass";

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
    supportsDarkMode,
    isDarkMode,
    darkModePreference,
    supportsAccent,
    accent,
    aquaMaterial,
    isAquaGlass,
  };
}
