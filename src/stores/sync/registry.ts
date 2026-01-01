// @ts-nocheck
import { buildSnapshot } from "./utils";
import type { StoreSnapshot } from "./types";

import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useDockStore } from "@/stores/useDockStore";
import { useFinderStore } from "@/stores/useFinderStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useAppletStore } from "@/stores/useAppletStore";
import { useSoundboardStore } from "@/stores/useSoundboardStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { usePcStore } from "@/stores/usePcStore";
import { useSynthStore } from "@/stores/useSynthStore";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useAppStore } from "@/stores/useAppStore";

type SnapshotBuilder = () => Promise<StoreSnapshot>;

interface SnapshotConfig {
  key: string;
  version: number;
  buildPayload: SnapshotBuilder;
}

// Helpers to avoid repeating the shape per store -----------------------------
const audioConfig: SnapshotConfig = {
  key: "ryos:audio-settings",
  version: 1,
  buildPayload: async () => {
    const s = useAudioSettingsStore.getState();
    const payload = {
      masterVolume: s.masterVolume,
      uiVolume: s.uiVolume,
      chatSynthVolume: s.chatSynthVolume,
      speechVolume: s.speechVolume,
      ipodVolume: s.ipodVolume,
      uiSoundsEnabled: s.uiSoundsEnabled,
      terminalSoundsEnabled: s.terminalSoundsEnabled,
      typingSynthEnabled: s.typingSynthEnabled,
      speechEnabled: s.speechEnabled,
      keepTalkingEnabled: s.keepTalkingEnabled,
      ttsModel: s.ttsModel,
      ttsVoice: s.ttsVoice,
      synthPreset: s.synthPreset,
    };
    return buildSnapshot(audioConfig.key, audioConfig.version, s._updatedAt ?? Date.now(), payload);
  },
};

const displayConfig: SnapshotConfig = {
  key: "ryos:display-settings",
  version: 1,
  buildPayload: async () => {
    const s = useDisplaySettingsStore.getState();
    const payload = {
      displayMode: s.displayMode,
      shaderEffectEnabled: s.shaderEffectEnabled,
      selectedShaderType: s.selectedShaderType,
      currentWallpaper: s.currentWallpaper,
      wallpaperSource: s.wallpaperSource,
      screenSaverEnabled: s.screenSaverEnabled,
      screenSaverType: s.screenSaverType,
      screenSaverIdleTime: s.screenSaverIdleTime,
      debugMode: s.debugMode,
      htmlPreviewSplit: s.htmlPreviewSplit,
    };
    return buildSnapshot(
      displayConfig.key,
      displayConfig.version,
      s._updatedAt ?? Date.now(),
      payload
    );
  },
};

const dockConfig: SnapshotConfig = {
  key: "dock-storage",
  version: 1,
  buildPayload: async () => {
    const s = useDockStore.getState();
    const payload = {
      pinnedItems: s.pinnedItems,
      scale: s.scale,
      hiding: s.hiding,
      magnification: s.magnification,
    };
    return buildSnapshot(dockConfig.key, dockConfig.version, s._updatedAt ?? Date.now(), payload);
  },
};

const finderConfig: SnapshotConfig = {
  key: "ryos:finder",
  version: 1,
  buildPayload: async () => {
    const s = useFinderStore.getState();
    const payload = {
      instances: s.instances,
      pathViewPreferences: s.pathViewPreferences,
    };
    return buildSnapshot(finderConfig.key, finderConfig.version, s._updatedAt ?? Date.now(), payload);
  },
};

const themeConfig: SnapshotConfig = {
  key: "ryos:theme",
  version: 1,
  buildPayload: async () => {
    const s = useThemeStore.getState();
    const payload = { current: s.current };
    return buildSnapshot(themeConfig.key, themeConfig.version, s._updatedAt ?? Date.now(), payload);
  },
};

const languageConfig: SnapshotConfig = {
  key: "ryos:language",
  version: 1,
  buildPayload: async () => {
    const s = useLanguageStore.getState();
    const payload = { current: s.current };
    return buildSnapshot(
      languageConfig.key,
      languageConfig.version,
      s._updatedAt ?? Date.now(),
      payload
    );
  },
};

const syncSettingsConfig: SnapshotConfig = {
  key: "ryos:sync-settings",
  version: 1,
  buildPayload: async () => {
    const s = useSyncSettingsStore.getState();
    const payload = {
      enabled: s.enabled,
      autoSync: s.autoSync,
      includeMedia: s.includeMedia,
      includeFiles: s.includeFiles,
      lastSyncAt: s.lastSyncAt,
      lastError: s.lastError,
    };
    return buildSnapshot(
      syncSettingsConfig.key,
      syncSettingsConfig.version,
      s._updatedAt ?? Date.now(),
      payload
    );
  },
};

const textEditConfig: SnapshotConfig = {
  key: "ryos:textedit",
  version: 1,
  buildPayload: async () => {
    const s = useTextEditStore.getState();
    const payload = {
      instances: s.instances,
    };
    return buildSnapshot(textEditConfig.key, textEditConfig.version, Date.now(), payload);
  },
};

const appletConfig: SnapshotConfig = {
  key: "applet-storage",
  version: 1,
  buildPayload: async () => {
    const s = useAppletStore.getState();
    const payload = { appletWindowSizes: s.appletWindowSizes };
    return buildSnapshot(appletConfig.key, appletConfig.version, Date.now(), payload);
  },
};

const soundboardConfig: SnapshotConfig = {
  key: "ryos:soundboard",
  version: 1,
  buildPayload: async () => {
    const s = useSoundboardStore.getState();
    const payload = {
      boards: s.boards,
      activeBoardId: s.activeBoardId,
      selectedDeviceId: s.selectedDeviceId,
      hasInitialized: s.hasInitialized,
    };
    return buildSnapshot(
      soundboardConfig.key,
      soundboardConfig.version,
      s._updatedAt ?? Date.now(),
      payload
    );
  },
};

const videoConfig: SnapshotConfig = {
  key: "ryos:videos",
  version: 8,
  buildPayload: async () => {
    const s = useVideoStore.getState();
    const payload = {
      videos: s.videos,
      currentVideoId: s.currentVideoId,
      loopAll: s.loopAll,
      loopCurrent: s.loopCurrent,
      isShuffled: s.isShuffled,
      isPlaying: s.isPlaying,
    };
    return buildSnapshot(
      videoConfig.key,
      videoConfig.version,
      s._updatedAt ?? Date.now(),
      payload
    );
  },
};

const karaokeConfig: SnapshotConfig = {
  key: "ryos:karaoke",
  version: 2,
  buildPayload: async () => {
    const s = useKaraokeStore.getState();
    const payload = {
      currentSongId: s.currentSongId,
      loopCurrent: s.loopCurrent,
      loopAll: s.loopAll,
      isShuffled: s.isShuffled,
      isFullScreen: s.isFullScreen,
    };
    return buildSnapshot(karaokeConfig.key, karaokeConfig.version, Date.now(), payload);
  },
};

const pcConfig: SnapshotConfig = {
  key: "ryos:pc",
  version: 0,
  buildPayload: async () => {
    const s = usePcStore.getState();
    const payload = {
      games: s.games,
    };
    return buildSnapshot(pcConfig.key, pcConfig.version, s._updatedAt ?? Date.now(), payload);
  },
};

const synthConfig: SnapshotConfig = {
  key: "ryos:synth",
  version: 1,
  buildPayload: async () => {
    const s = useSynthStore.getState();
    const payload = {
      presets: s.presets,
      currentPreset: s.currentPreset,
      labelType: s.labelType,
    };
    return buildSnapshot(
      synthConfig.key,
      synthConfig.version,
      s._updatedAt ?? Date.now(),
      payload
    );
  },
};

const ieConfig: SnapshotConfig = {
  key: "ryos:internet-explorer",
  version: 4,
  buildPayload: async () => {
    const s = useInternetExplorerStore.getState();
    const payload = {
      url: s.url,
      year: s.year,
      favorites: s.favorites,
      history: s.history.slice(0, 50),
      timelineSettings: s.timelineSettings,
      language: s.language,
      location: s.location,
    };
    return buildSnapshot(ieConfig.key, ieConfig.version, Date.now(), payload);
  },
};

// App store minimal snapshot: we only sync windowOrder/apps/meta (no instances)
const appStoreConfig: SnapshotConfig = {
  key: "ryos:app-store",
  version: 3,
  buildPayload: async () => {
    const s = useAppStore.getState();
    const payload = {
      windowOrder: s.windowOrder,
      apps: s.apps,
      aiModel: s.aiModel,
      isFirstBoot: s.isFirstBoot,
      macAppToastShown: s.macAppToastShown,
      lastSeenDesktopVersion: s.lastSeenDesktopVersion,
      ryOSVersion: s.ryOSVersion,
      ryOSBuildNumber: s.ryOSBuildNumber,
      ryOSBuildTime: s.ryOSBuildTime,
      recentApps: s.recentApps,
      recentDocuments: s.recentDocuments,
    };
    // useAppStore does not track _updatedAt; fall back to now
    return buildSnapshot(appStoreConfig.key, appStoreConfig.version, Date.now(), payload);
  },
};

const configs: SnapshotConfig[] = [
  themeConfig,
  languageConfig,
  syncSettingsConfig,
  audioConfig,
  displayConfig,
  dockConfig,
  finderConfig,
  textEditConfig,
  appletConfig,
  soundboardConfig,
  videoConfig,
  karaokeConfig,
  pcConfig,
  synthConfig,
  ieConfig,
  appStoreConfig,
];

export async function buildLocalSnapshots(): Promise<StoreSnapshot[]> {
  const snapshots: StoreSnapshot[] = [];
  for (const cfg of configs) {
    const snap = await cfg.buildPayload();
    snapshots.push(snap);
  }
  return snapshots;
}
