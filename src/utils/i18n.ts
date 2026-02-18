import i18n from "@/lib/i18n";
import { useThemeStore } from "@/stores/useThemeStore";

export type AppId =
  | "finder"
  | "soundboard"
  | "internet-explorer"
  | "chats"
  | "textedit"
  | "paint"
  | "photo-booth"
  | "minesweeper"
  | "videos"
  | "ipod"
  | "karaoke"
  | "synth"
  | "pc"
  | "terminal"
  | "applet-viewer"
  | "control-panels"
  | "admin"
  | "stickies"
  | "infinite-mac"
  | "winamp";

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
 * Get translated folder name from folder name (not path)
 * Useful when you only have the folder name string
 */
export function getTranslatedFolderNameFromName(folderName: string): string {
  const folderNameMap: Record<string, string> = {
    "Applications": "applications",
    "Documents": "documents",
    "Images": "images",
    "Music": "music",
    "Videos": "videos",
    "Sites": "sites",
    "Applets": "applets",
    "Trash": "trash",
    "Desktop": "desktop",
  };

  const key = folderNameMap[folderName];
  if (key) {
    const translationKey = `apps.finder.folders.${key}`;
    const translated = i18n.t(translationKey);
    return translated !== translationKey ? translated : folderName;
  }

  return folderName;
}
