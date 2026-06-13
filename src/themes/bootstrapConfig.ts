import {
  DEFAULT_OS_THEME_ID,
  getOsMacChrome,
  getOsPlatform,
  themes,
} from "@/themes";
import type { OsThemeId } from "@/themes/types";

export interface ThemeBootstrapEntry {
  platform: "mac" | "windows";
  macChrome: "aqua" | "system7" | null;
  supportsDarkMode: boolean;
}

export interface ThemeBootstrapConfig {
  defaultTheme: OsThemeId;
  themes: Record<OsThemeId, ThemeBootstrapEntry>;
}

export function getThemeBootstrapConfig(): ThemeBootstrapConfig {
  const entries = Object.keys(themes).map((id) => {
    const themeId = id as OsThemeId;
    return [
      themeId,
      {
        platform: getOsPlatform(themeId),
        macChrome: getOsMacChrome(themeId),
        supportsDarkMode: themes[themeId].metadata.supportsDarkMode,
      },
    ] as const;
  });

  return {
    defaultTheme: DEFAULT_OS_THEME_ID,
    themes: Object.fromEntries(entries) as Record<OsThemeId, ThemeBootstrapEntry>,
  };
}
