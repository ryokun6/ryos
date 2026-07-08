import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useThemeStore } from "@/stores/useThemeStore";
import type { DarkModePreference } from "@/stores/useThemeStore";
import { getOsMacChrome, getOsPlatform, getThemeMetadata } from "@/themes";
import type { OsMacChrome, OsPlatform } from "@/themes/types";
import { DEFAULT_ACCENT, type AccentId } from "@/themes/accents";

type ThemeFlagSlice = {
  currentTheme: ReturnType<typeof useThemeStore.getState>["current"];
  isDark: boolean;
  darkModePreference: DarkModePreference;
  accent: AccentId;
  aquaMaterial: ReturnType<typeof useThemeStore.getState>["aquaMaterial"];
};

/**
 * Theme-derived flags for chrome/layout. Uses a single shallow Zustand
 * subscription so ~150 call sites don't each open 5 independent selectors.
 */
export function useThemeFlags() {
  const { currentTheme, isDark, darkModePreference, accent, aquaMaterial } =
    useThemeStore(
      useShallow(
        (state): ThemeFlagSlice => ({
          currentTheme: state.current,
          isDark: state.isDark,
          darkModePreference: state.darkModeByTheme[state.current] ?? "system",
          accent: state.accentByTheme[state.current] ?? DEFAULT_ACCENT,
          aquaMaterial: state.aquaMaterial,
        })
      )
    );

  return useMemo(() => {
    const metadata = getThemeMetadata(currentTheme);
    const osPlatform: OsPlatform = getOsPlatform(currentTheme);
    const macChrome: OsMacChrome | null = getOsMacChrome(currentTheme);
    const isWindowsTheme = metadata.isWindows;
    const isMacTheme = metadata.isMac;
    const isMacOSTheme = currentTheme === "macosx";
    const isSystem7Theme = currentTheme === "system7";
    const isWinXp = currentTheme === "xp";
    const isWin98 = currentTheme === "win98";
    const isClassicTheme = isWindowsTheme || isSystem7Theme;
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
  }, [currentTheme, isDark, darkModePreference, accent, aquaMaterial]);
}
