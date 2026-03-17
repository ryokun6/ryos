import { useThemeStore } from "@/stores/useThemeStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useDockStore } from "@/stores/useDockStore";
import { useDashboardStore } from "@/stores/useDashboardStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  beginApplyingRemoteSettingsSections,
  endApplyingRemoteSettingsSections,
  getSettingsSectionTimestampMap,
  setSettingsSectionTimestamps,
  type SettingsSyncSection,
} from "@/sync/state";
import {
  getRemoteSettingsSectionsToApply,
  normalizeSettingsSnapshotData,
  shouldRestoreLegacyCustomWallpapers,
  type SettingsSnapshotData,
} from "@/utils/cloudSyncSettingsMerge";
import { STORES } from "@/utils/indexedDB";
import { readStoreItems } from "@/utils/indexedDBBackup";
import { getIndexedDbHandle, upsertStoreItems } from "./blob-shared";

export function serializeSettingsSnapshot(): SettingsSnapshotData {
  const displayState = useDisplaySettingsStore.getState();
  const audioState = useAudioSettingsStore.getState();
  const ipodState = useIpodStore.getState();
  const dockState = useDockStore.getState();
  const dashboardState = useDashboardStore.getState();
  const sectionUpdatedAt = getSettingsSectionTimestampMap();

  return {
    theme: useThemeStore.getState().current,
    language: useLanguageStore.getState().current,
    languageInitialized:
      localStorage.getItem("ryos:language-initialized") === "true",
    aiModel: useAppStore.getState().aiModel,
    display: {
      displayMode: displayState.displayMode,
      shaderEffectEnabled: displayState.shaderEffectEnabled,
      selectedShaderType: displayState.selectedShaderType,
      currentWallpaper: displayState.currentWallpaper,
      screenSaverEnabled: displayState.screenSaverEnabled,
      screenSaverType: displayState.screenSaverType,
      screenSaverIdleTime: displayState.screenSaverIdleTime,
      debugMode: displayState.debugMode,
      htmlPreviewSplit: displayState.htmlPreviewSplit,
    },
    audio: {
      masterVolume: audioState.masterVolume,
      uiVolume: audioState.uiVolume,
      chatSynthVolume: audioState.chatSynthVolume,
      speechVolume: audioState.speechVolume,
      ipodVolume: audioState.ipodVolume,
      uiSoundsEnabled: audioState.uiSoundsEnabled,
      terminalSoundsEnabled: audioState.terminalSoundsEnabled,
      typingSynthEnabled: audioState.typingSynthEnabled,
      speechEnabled: audioState.speechEnabled,
      keepTalkingEnabled: audioState.keepTalkingEnabled,
      ttsModel: audioState.ttsModel,
      ttsVoice: audioState.ttsVoice,
      synthPreset: audioState.synthPreset,
    },
    ipod: {
      displayMode: ipodState.displayMode,
      showLyrics: ipodState.showLyrics,
      lyricsAlignment: ipodState.lyricsAlignment,
      lyricsFont: ipodState.lyricsFont,
      romanization: ipodState.romanization,
      lyricsTranslationLanguage: ipodState.lyricsTranslationLanguage ?? null,
      theme: ipodState.theme,
      lcdFilterOn: ipodState.lcdFilterOn,
    },
    dock: {
      pinnedItems: dockState.pinnedItems,
      scale: dockState.scale,
      hiding: dockState.hiding,
      magnification: dockState.magnification,
    },
    dashboard: {
      widgets: dashboardState.widgets,
    },
    sectionUpdatedAt,
  };
}

export async function applySettingsSnapshot(
  data: SettingsSnapshotData,
  fallbackUpdatedAt: string,
  providedDb?: IDBDatabase
): Promise<void> {
  const normalizedData = normalizeSettingsSnapshotData(data, fallbackUpdatedAt);
  const remoteSectionUpdatedAt = normalizedData.sectionUpdatedAt || {};
  const localSectionUpdatedAt = getSettingsSectionTimestampMap();
  const sectionsToApply = getRemoteSettingsSectionsToApply(
    localSectionUpdatedAt,
    remoteSectionUpdatedAt
  );

  if (sectionsToApply.length > 0) {
    console.log(
      `[CloudSync] Settings apply: sections to apply: [${sectionsToApply.join(", ")}]`
    );
  } else {
    console.log(
      "[CloudSync] Settings apply: no sections to apply (all local timestamps >= remote)"
    );
  }

  const legacyCustomWallpapers = normalizedData.customWallpapers || [];
  const hasDedicatedCustomWallpaperSync = Boolean(
    useCloudSyncStore.getState().remoteMetadata["custom-wallpapers"]?.updatedAt
  );

  if (legacyCustomWallpapers.length > 0) {
    const { db, shouldClose } = await getIndexedDbHandle(providedDb);
    try {
      const localWallpaperCount = (
        await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
      ).length;
      if (
        shouldRestoreLegacyCustomWallpapers({
          legacyWallpaperCount: legacyCustomWallpapers.length,
          localWallpaperCount,
          hasDedicatedCustomWallpaperSync,
        })
      ) {
        await upsertStoreItems(
          db,
          STORES.CUSTOM_WALLPAPERS,
          legacyCustomWallpapers
        );
        useDisplaySettingsStore.getState().bumpCustomWallpapersRevision();
      }
    } finally {
      if (shouldClose) {
        db.close();
      }
    }
  }

  const appliedSections: SettingsSyncSection[] = [];

  beginApplyingRemoteSettingsSections(sectionsToApply);
  try {
    if (sectionsToApply.includes("theme")) {
      try {
        useThemeStore.getState().setTheme(normalizedData.theme as never);
        appliedSections.push("theme");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote theme:", e);
      }
    }

    if (sectionsToApply.includes("language")) {
      try {
        localStorage.setItem(
          "ryos:language-initialized",
          normalizedData.languageInitialized ? "true" : "false"
        );
        await useLanguageStore.getState().setLanguage(normalizedData.language);
        appliedSections.push("language");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote language:", e);
      }
    }

    if (sectionsToApply.includes("display")) {
      try {
        useDisplaySettingsStore.setState({
          displayMode: normalizedData.display.displayMode as never,
          shaderEffectEnabled: normalizedData.display.shaderEffectEnabled,
          selectedShaderType: normalizedData.display.selectedShaderType as never,
          screenSaverEnabled: normalizedData.display.screenSaverEnabled,
          screenSaverType: normalizedData.display.screenSaverType,
          screenSaverIdleTime: normalizedData.display.screenSaverIdleTime,
          debugMode: normalizedData.display.debugMode,
          htmlPreviewSplit: normalizedData.display.htmlPreviewSplit,
        });

        await useDisplaySettingsStore
          .getState()
          .setWallpaper(normalizedData.display.currentWallpaper);
        appliedSections.push("display");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote display:", e);
      }
    }

    if (sectionsToApply.includes("audio")) {
      try {
        useAudioSettingsStore.setState({
          masterVolume: normalizedData.audio.masterVolume,
          uiVolume: normalizedData.audio.uiVolume,
          chatSynthVolume: normalizedData.audio.chatSynthVolume,
          speechVolume: normalizedData.audio.speechVolume,
          ipodVolume: normalizedData.audio.ipodVolume,
          uiSoundsEnabled: normalizedData.audio.uiSoundsEnabled,
          terminalSoundsEnabled: normalizedData.audio.terminalSoundsEnabled,
          typingSynthEnabled: normalizedData.audio.typingSynthEnabled,
          speechEnabled: normalizedData.audio.speechEnabled,
          keepTalkingEnabled: normalizedData.audio.keepTalkingEnabled,
          ttsModel: normalizedData.audio.ttsModel,
          ttsVoice: normalizedData.audio.ttsVoice,
          synthPreset: normalizedData.audio.synthPreset,
        });
        appliedSections.push("audio");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote audio:", e);
      }
    }

    if (sectionsToApply.includes("aiModel")) {
      try {
        useAppStore.getState().setAiModel(normalizedData.aiModel);
        appliedSections.push("aiModel");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote aiModel:", e);
      }
    }

    if (normalizedData.ipod && sectionsToApply.includes("ipod")) {
      try {
        const remoteIpod = normalizedData.ipod;
        useIpodStore.setState({
          displayMode: remoteIpod.displayMode,
          showLyrics: remoteIpod.showLyrics,
          lyricsAlignment: remoteIpod.lyricsAlignment,
          lyricsFont: remoteIpod.lyricsFont,
          romanization: remoteIpod.romanization,
          lyricsTranslationLanguage: remoteIpod.lyricsTranslationLanguage ?? null,
          theme: remoteIpod.theme,
          lcdFilterOn: remoteIpod.lcdFilterOn,
        });
        appliedSections.push("ipod");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote ipod:", e);
      }
    }

    if (normalizedData.dock && sectionsToApply.includes("dock")) {
      try {
        useDockStore.setState({
          pinnedItems: normalizedData.dock.pinnedItems,
          scale: normalizedData.dock.scale,
          hiding: normalizedData.dock.hiding,
          magnification: normalizedData.dock.magnification,
        });
        appliedSections.push("dock");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote dock:", e);
      }
    }

    if (
      normalizedData.dashboard?.widgets &&
      Array.isArray(normalizedData.dashboard.widgets) &&
      sectionsToApply.includes("dashboard")
    ) {
      try {
        useDashboardStore.setState({
          widgets: normalizedData.dashboard.widgets,
        });
        appliedSections.push("dashboard");
      } catch (e) {
        console.error("[CloudSync] Failed to apply remote dashboard:", e);
      }
    }
  } finally {
    endApplyingRemoteSettingsSections(sectionsToApply);
  }

  if (appliedSections.length < sectionsToApply.length) {
    const failed = sectionsToApply.filter((s) => !appliedSections.includes(s));
    console.warn(
      `[CloudSync] Settings apply: ${appliedSections.length}/${sectionsToApply.length} sections succeeded, failed: ${failed.join(", ")}`
    );
  }

  setSettingsSectionTimestamps(
    Object.fromEntries(
      appliedSections.map((section) => [
        section,
        remoteSectionUpdatedAt[section] || fallbackUpdatedAt,
      ])
    )
  );
}
