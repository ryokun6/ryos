import { useMemo } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { getThemeMetadata } from "@/themes";

/**
 * Theme-derived flags for React components. Prefer this or `isWindowsTheme()` from `@/themes`
 * instead of `currentTheme === "xp" || currentTheme === "win98"`.
 */
export function useThemeFlags() {
  const currentTheme = useThemeStore((state) => state.current);
  const metadata = useMemo(() => getThemeMetadata(currentTheme), [currentTheme]);

  const isWindowsTheme = metadata.isWindows;
  const isMacTheme = metadata.isMac;
  const isMacOSTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";
  /** True for XP and Windows 98 (same as `isWindowsTheme`). */
  const isXpTheme = isWindowsTheme;
  const isClassicTheme = isXpTheme || isSystem7Theme;

  return {
    currentTheme,
    metadata,
    isWindowsTheme,
    isMacTheme,
    isMacOSTheme,
    isSystem7Theme,
    isXpTheme,
    isClassicTheme,
  };
}
