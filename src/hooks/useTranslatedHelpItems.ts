import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MAPS_HELP_I18N_KEYS } from "@/apps/maps/helpKeys";
import type { AppId } from "@/utils/i18n";

const HELP_KEYS: Record<AppId, string[]> = {
  finder: [
    "browseNavigate",
    "fileManagement",
    "quickAccess",
    "airdropSharing",
    "dropToImport",
    "trashUndo",
  ],
  soundboard: [
    "recordSlot",
    "keyboardPlay",
    "waveformView",
    "customizeSlot",
    "multipleBoards",
    "importExport",
  ],
  "internet-explorer": [
    "browseWeb",
    "travelThroughTime",
    "historyReimagined",
    "saveFavorites",
    "exploreTimeNodes",
    "shareJourney",
  ],
  chats: [
    "chatWithRyo",
    "createEditFiles",
    "controlApps",
    "joinChatRooms",
    "pushToTalk",
    "nudgeDjMode",
  ],
  textedit: [
    "slashCommands",
    "formatting",
    "listsTasks",
    "aiCoEditor",
    "voiceDictation",
    "fileManagement",
  ],
  paint: [
    "drawingTools",
    "strokeWidth",
    "patterns",
    "cutCopyPaste",
    "filters",
    "autoSaveExport",
  ],
  "photo-booth": [
    "takingPhoto",
    "quickSnaps",
    "applyingEffects",
    "viewingPhotos",
    "downloadingPhotos",
    "switchingCameras",
  ],
  minesweeper: [
    "desktopControls",
    "mobileControls",
    "chordReveal",
    "mineCounterTimer",
    "smileyStatus",
    "quickRestart",
  ],
  videos: [
    "addVideo",
    "playback",
    "loop",
    "shuffle",
    "powersTv",
    "shareDeepLinks",
  ],
  tv: [
    "channels",
    "playback",
    "numbers",
    "aiChannels",
    "mtvChannel",
    "fullscreen",
  ],
  ipod: [
    "addSongs",
    "wheelNavigation",
    "lyricsPronunciation",
    "coverFlow",
    "karaokeSync",
    "displayFullscreen",
  ],
  karaoke: [
    "addSearchSongs",
    "syncLyricsTiming",
    "stylePronunciation",
    "listenParty",
    "syncedWithIpod",
    "keyboardShortcuts",
  ],
  synth: [
    "virtualKeyboard",
    "controlsPanel",
    "presets",
    "waveform3d",
    "effects",
    "octaveShift",
  ],
  terminal: [
    "basicCommands",
    "navigation",
    "aiAssistant",
    "fileEditing",
    "commandHistory",
    "terminalSounds",
  ],
  "applet-viewer": [
    "appletStore",
    "createWithRyosChat",
    "viewApplets",
    "shareApplets",
    "openFromFinder",
    "keepUpdated",
  ],
  "control-panels": [
    "appearance",
    "shaderEffects",
    "sounds",
    "aiModel",
    "sync",
    "backupRestore",
  ],
  admin: [
    "adminAccess",
    "userManagement",
    "roomManagement",
    "songLibrary",
    "searchFilter",
    "statistics",
  ],
  stickies: [
    "createNote",
    "colors",
    "moveResize",
    "ryoCanEdit",
    "clearAll",
    "autoSave",
  ],
  "infinite-mac": [
    "classicMacEmulator",
    "selectSystem",
    "displayScaling",
    "pauseResume",
    "captureScreenshot",
    "chatsCanDriveIt",
  ],
  pc: [
    "pcEmulator",
    "dosGames",
    "mouseCapture",
    "keyboardInput",
    "screenshotFullscreen",
    "backToSystems",
  ],
  winamp: [
    "playMusic",
    "equalizer",
    "playlist",
    "skins",
    "shuffleRepeat",
    "controls",
  ],
  calendar: [
    "navigateMonths",
    "createEvents",
    "todosSidebar",
    "icalImportExport",
    "ryoSchedules",
    "undoAutoSave",
  ],
  contacts: [
    "browseContacts",
    "createContacts",
    "importVCards",
    "smartGroups",
    "useWithRyo",
    "cloudSync",
  ],
  dashboard: [
    "openDashboard",
    "widgetLibrary",
    "weatherWidget",
    "moveWidgets",
    "layoutPersists",
    "closeDashboard",
  ],
  candybar: [
    "browseIconPacks",
    "iconPackDetails",
    "applyIconPacks",
    "favorites",
    "search",
    "cloudLibrary",
  ],
  maps: [...MAPS_HELP_I18N_KEYS],
};

/**
 * Hook to get translated help items for an app
 * Merges translated text with original icons
 */
export function useTranslatedHelpItems<TIcon extends ReactNode = string>(
  appId: AppId,
  originalHelpItems: Array<{ icon: TIcon; title: string; description: string }>
) {
  const { t } = useTranslation();

  return useMemo(() => {
    const keys = HELP_KEYS[appId] || [];
    return originalHelpItems.map((item, index) => {
      const key = keys[index];
      if (!key) return item; // Fallback to original if no key

      const titleKey = `apps.${appId}.help.${key}.title`;
      const descKey = `apps.${appId}.help.${key}.description`;

      return {
        icon: item.icon, // Keep original icon
        title: t(titleKey, { defaultValue: item.title }),
        description: t(descKey, { defaultValue: item.description }),
      };
    });
  }, [appId, originalHelpItems, t]);
}

