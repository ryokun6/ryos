import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDisplaySettingsStoreShallow } from "@/stores/helpers";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { getTabStyles } from "@/utils/tabStyles";
import { getTranslatedAppName } from "@/utils/i18n";
import type { ControlPanelsInitialData } from "@/apps/base/types";

export interface UseAppearanceSettingsProps {
  initialData?: ControlPanelsInitialData;
}

export function useAppearanceSettings({ initialData }: UseAppearanceSettingsProps) {
  const {
    debugMode,
    setDebugMode,
    shaderEffectEnabled,
    setShaderEffectEnabled,
  } = useDisplaySettingsStoreShallow((s) => ({
    debugMode: s.debugMode,
    setDebugMode: s.setDebugMode,
    shaderEffectEnabled: s.shaderEffectEnabled,
    setShaderEffectEnabled: s.setShaderEffectEnabled,
  }));

  const {
    currentTheme,
    supportsDarkMode,
    isDarkMode,
    darkModePreference,
    supportsAccent,
    accent,
    macChrome,
  } = useThemeFlags();
  const setTheme = useThemeStore((state) => state.setTheme);
  const setDarkMode = useThemeStore((state) => state.setDarkMode);
  const setAccent = useThemeStore((state) => state.setAccent);
  const wallpaperAccentColor = useThemeStore(
    (state) => state.wallpaperAccentColor
  );

  const currentLanguage = useLanguageStore((state) => state.current);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOSXTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";
  const isClassicMacTheme = isMacOSXTheme || isSystem7Theme;
  const isWindowsLegacyTheme = isXpTheme;

  const tabStyles = getTabStyles(currentTheme);
  const defaultTab = initialData?.defaultTab || "appearance";
  const windowTitle = getTranslatedAppName("control-panels");

  return {
    windowTitle,
    defaultTab,
    debugMode,
    setDebugMode,
    shaderEffectEnabled,
    setShaderEffectEnabled,
    currentTheme,
    setTheme,
    supportsDarkMode,
    isDarkMode,
    darkModePreference,
    setDarkMode,
    supportsAccent,
    accent,
    accentChrome: macChrome,
    setAccent,
    wallpaperAccentColor,
    currentLanguage,
    setLanguage,
    tabStyles,
    isXpTheme,
    isMacOSXTheme,
    isClassicMacTheme,
    isWindowsLegacyTheme,
  };
}
