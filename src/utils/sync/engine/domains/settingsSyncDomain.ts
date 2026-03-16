import { useThemeStore } from "@/stores/useThemeStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useDockStore } from "@/stores/useDockStore";
import { useDashboardStore } from "@/stores/useDashboardStore";
import {
  beginApplyingRemoteSettingsSections,
  endApplyingRemoteSettingsSections,
  getCloudSyncLanguageInitialized,
  getSettingsSectionTimestampMap,
  setCloudSyncLanguageInitialized,
  setSettingsSectionTimestamps,
  type SettingsSyncSection,
} from "@/utils/sync/engine/state/syncStateAdapter";
import {
  getRemoteSettingsSectionsToApply,
  normalizeSettingsSnapshotData,
  type SettingsSnapshotData,
} from "@/utils/cloudSyncSettingsMerge";

export interface ApplySettingsSyncSnapshotOptions {
  beforeApply?: (
    normalizedData: SettingsSnapshotData
  ) => Promise<void> | void;
}

export function serializeSettingsSyncSnapshot(): SettingsSnapshotData {
  const displayState = useDisplaySettingsStore.getState();
  const audioState = useAudioSettingsStore.getState();
  const ipodState = useIpodStore.getState();
  const dockState = useDockStore.getState();
  const dashboardState = useDashboardStore.getState();
  const sectionUpdatedAt = getSettingsSectionTimestampMap();

  return {
    theme: useThemeStore.getState().current,
    language: useLanguageStore.getState().current,
    languageInitialized: getCloudSyncLanguageInitialized(),
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

export async function applySettingsSyncSnapshot(
  data: SettingsSnapshotData,
  fallbackUpdatedAt: string,
  options?: ApplySettingsSyncSnapshotOptions
): Promise<void> {
  const normalizedData = normalizeSettingsSnapshotData(data, fallbackUpdatedAt);
  const remoteSectionUpdatedAt = normalizedData.sectionUpdatedAt || {};
  const localSectionUpdatedAt = getSettingsSectionTimestampMap();
  const sectionsToApply = getRemoteSettingsSectionsToApply(
    localSectionUpdatedAt,
    remoteSectionUpdatedAt
  );

  await options?.beforeApply?.(normalizedData);

  const appliedSections: SettingsSyncSection[] = [];

  beginApplyingRemoteSettingsSections(sectionsToApply);
  try {
    if (sectionsToApply.includes("theme")) {
      try {
        useThemeStore.getState().setTheme(normalizedData.theme as never);
        appliedSections.push("theme");
      } catch (error) {
        console.error("[CloudSync] Failed to apply remote theme:", error);
      }
    }

    if (sectionsToApply.includes("language")) {
      try {
        await useLanguageStore.getState().setLanguage(normalizedData.language);
        setCloudSyncLanguageInitialized(normalizedData.languageInitialized);
        appliedSections.push("language");
      } catch (error) {
        console.error("[CloudSync] Failed to apply remote language:", error);
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
      } catch (error) {
        console.error("[CloudSync] Failed to apply remote display:", error);
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
      } catch (error) {
        console.error("[CloudSync] Failed to apply remote audio:", error);
      }
    }

    if (sectionsToApply.includes("aiModel")) {
      try {
        useAppStore.getState().setAiModel(normalizedData.aiModel);
        appliedSections.push("aiModel");
      } catch (error) {
        console.error("[CloudSync] Failed to apply remote aiModel:", error);
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
      } catch (error) {
        console.error("[CloudSync] Failed to apply remote ipod:", error);
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
      } catch (error) {
        console.error("[CloudSync] Failed to apply remote dock:", error);
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
      } catch (error) {
        console.error("[CloudSync] Failed to apply remote dashboard:", error);
      }
    }
  } finally {
    endApplyingRemoteSettingsSections(sectionsToApply);
  }

  if (appliedSections.length < sectionsToApply.length) {
    const failed = sectionsToApply.filter((section) => !appliedSections.includes(section));
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
