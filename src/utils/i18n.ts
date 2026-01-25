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
  | "infinite-mac";

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
    "/Images": "images",
    "/Music": "music",
    "/Videos": "videos",
    "/Sites": "sites",
    "/Applets": "applets",
    "/Trash": "trash",
    "/Desktop": "desktop",
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

/**
 * Get translated help items for an app
 * Maps help item keys to translation paths
 */
export function getTranslatedHelpItems(appId: AppId): Array<{
  icon: string;
  title: string;
  description: string;
}> {
  const helpKeys: Record<AppId, string[]> = {
    finder: ["browseNavigate", "fileManagement", "viewSort", "quickAccess", "storageInfo", "trash"],
    soundboard: ["recordSlot", "keyboardPlay", "waveformView", "customizeSlot", "multipleBoards", "importExport"],
    "internet-explorer": ["browseWeb", "travelThroughTime", "historyReimagined", "saveFavorites", "exploreTimeNodes", "shareJourney"],
    chats: ["chatWithRyo", "createEditFiles", "controlApps", "joinChatRooms", "pushToTalk", "nudgeDjMode"],
    textedit: ["richEditing", "formatting", "listsTasks", "fileManagement", "voiceDictation", "slashCommands"],
    paint: ["drawingTools", "colors", "undo", "saving", "patterns", "filters"],
    "photo-booth": ["takingPhoto", "quickSnaps", "applyingEffects", "viewingPhotos", "downloadingPhotos", "switchingCameras"],
    minesweeper: ["desktopControls", "mobileControls", "gameRules", "timerCounter", "restart"],
    videos: ["addVideo", "playback", "loop", "shuffle", "playlist", "retroUi"],
    ipod: ["addSongs", "wheelNavigation", "playbackControls", "syncedLyrics", "playbackModes", "displayFullscreen"],
    karaoke: ["addSearchSongs", "syncLyricsTiming", "styleLayout", "syncedWithIpod", "worksWithChats", "keyboardShortcuts"],
    synth: ["virtualKeyboard", "controlsPanel", "presets", "waveform3d", "effects", "midiInput"],
    pc: ["pcEmulator", "keyboardControls", "mouseCapture", "fullscreenMode", "saveStates", "aspectRatio"],
    terminal: ["basicCommands", "navigation", "commandHistory", "aiAssistant", "fileEditing", "terminalSounds"],
    "applet-viewer": ["appletStore", "createWithRyosChat", "viewApplets", "shareApplets", "openFromFinder", "keepUpdated"],
    "control-panels": ["appearance", "sounds", "aiModel", "shaderEffects", "backupRestore", "system"],
    admin: ["adminAccess", "userManagement", "roomManagement", "statistics"],
    stickies: ["createNote", "colors", "deleteNote", "autoSave"],
    "infinite-mac": ["classicMacEmulator", "selectSystem", "pauseResume", "backToSystems"],
  };

  const keys = helpKeys[appId] || [];
  return keys.map((key) => {
    const titleKey = `apps.${appId}.help.${key}.title`;
    const descKey = `apps.${appId}.help.${key}.description`;
    
    // Get icon from original help items (we'll need to pass this or store it)
    // For now, return empty icon - components should use original helpItems
    return {
      icon: "", // Will be filled by component using original helpItems
      title: i18n.t(titleKey),
      description: i18n.t(descKey),
    };
  });
}
