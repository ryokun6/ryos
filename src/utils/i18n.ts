import i18n from "@/lib/i18n";
import { useThemeStore } from "@/stores/useThemeStore";
import type { AppId } from "@/config/appRegistryData";

export type { AppId } from "@/config/appRegistryData";

/**
 * Get translated app name with theme-awareness
 * For certain apps (like control-panels), the name changes based on theme:
 * - macOS X: "System Preferences"
 * - System 7, Windows 98, Windows XP: "Control Panels"
 */
export function getTranslatedAppName(appId: AppId): string {
  const currentTheme = useThemeStore.getState().current;
  
  // Theme-specific app names
  if (appId === "control-panels") {
    if (currentTheme === "macosx") {
      const macKey = `apps.${appId}.nameForMacosX`;
      const macTranslated = i18n.t(macKey);
      if (macTranslated !== macKey) {
        return macTranslated;
      }
    }
  }
  
  const key = `apps.${appId}.name`;
  const translated = i18n.t(key);
  // If translation doesn't exist, return the key (fallback)
  return translated !== key ? translated : appId;
}

/**
 * Get translated app description
 */
export function getTranslatedAppDescription(appId: AppId): string {
  const key = `apps.${appId}.description`;
  const translated = i18n.t(key);
  // If translation doesn't exist, return empty string
  return translated !== key ? translated : "";
}

/**
 * Get translated folder name
 * Returns the localized name for a folder path, or the original name if no translation exists
 */
export function getTranslatedFolderName(folderPath: string): string {
  // Map folder paths to translation keys
  const folderKeyMap: Record<string, string> = {
    "/Applications": "applications",
    "/Documents": "documents",
    "/Desktop": "desktop",
    "/Downloads": "downloads",
    "/Images": "images",
    "/Books": "books",
    "/Music": "music",
    "/Videos": "videos",
    "/Sites": "sites",
    "/Applets": "applets",
    "/System": "system",
    "/Trash": "trash",
  };

  const key = folderKeyMap[folderPath];
  if (key) {
    const translationKey = `apps.finder.folders.${key}`;
    const translated = i18n.t(translationKey);
    // If translation doesn't exist, return the key (fallback)
    return translated !== translationKey ? translated : folderPath.split("/").pop() || folderPath;
  }

  // For subfolders or unknown folders, return the last segment of the path
  return folderPath.split("/").pop() || folderPath;
}

/**
 * Get translated folder name from folder name (not path)
 * Useful when you only have the folder name string
 */
export function getTranslatedFolderNameFromName(folderName: string): string {
  const folderNameMap: Record<string, string> = {
    "Applications": "applications",
    "Documents": "documents",
    "Desktop": "desktop",
    "Downloads": "downloads",
    "Images": "images",
    "Books": "books",
    "Music": "music",
    "Videos": "videos",
    "Sites": "sites",
    "Applets": "applets",
    "System": "system",
    "Trash": "trash",
  };

  const key = folderNameMap[folderName];
  if (key) {
    const translationKey = `apps.finder.folders.${key}`;
    const translated = i18n.t(translationKey);
    return translated !== translationKey ? translated : folderName;
  }

  return folderName;
}
