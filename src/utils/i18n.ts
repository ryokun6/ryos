import i18n from "@/lib/i18n";

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
  | "synth"
  | "pc"
  | "terminal"
  | "applet-viewer"
  | "control-panels";

/**
 * Get translated app name
 */
export function getTranslatedAppName(appId: AppId): string {
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
    synth: ["virtualKeyboard", "controlsPanel", "presets", "waveform3d", "effects", "midiInput"],
    pc: ["pcEmulator", "keyboardControls", "mouseCapture", "fullscreenMode", "saveStates", "aspectRatio"],
    terminal: ["basicCommands", "navigation", "commandHistory", "aiAssistant", "fileEditing", "terminalSounds"],
    "applet-viewer": ["appletStore", "createWithRyosChat", "viewApplets", "shareApplets", "openFromFinder", "keepUpdated"],
    "control-panels": ["appearance", "sounds", "aiModel", "shaderEffects", "backupRestore", "system"],
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
