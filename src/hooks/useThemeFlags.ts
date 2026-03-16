import { useMemo } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { getThemeMetadata } from "@/themes";

export function useThemeFlags() {
  const currentTheme = useThemeStore((state) => state.current);
  const metadata = useMemo(() => getThemeMetadata(currentTheme), [currentTheme]);

  const isWindowsTheme = metadata.isWindows;
  const isMacTheme = metadata.isMac;
  const isMacOSTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";
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
