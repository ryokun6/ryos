import { useMemo, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CALCULATOR_HELP_I18N_KEYS } from "@/apps/calculator/helpKeys";
import { INTERNET_EXPLORER_HELP_I18N_KEYS } from "@/apps/internet-explorer/helpKeys";
import { MAPS_HELP_I18N_KEYS } from "@/apps/maps/helpKeys";
import type { AppId } from "@/utils/i18n";

interface HelpItem<TIcon extends ReactNode = string> {
  icon: TIcon;
  title: string;
  description: string;
}

export const APP_HELP_I18N_KEYS: Record<AppId, readonly string[]> = {
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
  "internet-explorer": [...INTERNET_EXPLORER_HELP_I18N_KEYS],
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
    "shareSongs",
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
  maps: [...MAPS_HELP_I18N_KEYS],
  books: [
    "bookshelf",
    "import",
    "pageTurn",
    "progress",
    "fonts",
    "darkMode",
  ],
  calculator: [...CALCULATOR_HELP_I18N_KEYS],
};

/**
 * Get translated help items for an app while preserving the original icons.
 */
export function getTranslatedHelpItems<TIcon extends ReactNode = string>(
  t: TFunction,
  appId: AppId,
  originalHelpItems: Array<HelpItem<TIcon>>
): Array<HelpItem<TIcon>> {
  const keys = APP_HELP_I18N_KEYS[appId] || [];
  return originalHelpItems.map((item, index) => {
    const key = keys[index];
    if (!key) return item;

    const titleKey = `apps.${appId}.help.${key}.title`;
    const descKey = `apps.${appId}.help.${key}.description`;

    return {
      icon: item.icon,
      title: t(titleKey, { defaultValue: item.title }),
      description: t(descKey, { defaultValue: item.description }),
    };
  });
}

export function useTranslatedHelpItems<TIcon extends ReactNode = string>(
  appId: AppId,
  originalHelpItems: Array<HelpItem<TIcon>>
) {
  const { t } = useTranslation();

  return useMemo(
    () => getTranslatedHelpItems(t, appId, originalHelpItems),
    [appId, originalHelpItems, t]
  );
}

