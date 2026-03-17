import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { helpItems } from "..";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { logoutAllDevices } from "@/api/auth";
import {
  fetchCloudSyncStatus as fetchCloudSyncStatusApi,
  getCloudBackupDownloadUrl,
  requestCloudBackupUploadInstruction,
  saveCloudBackupMetadata,
} from "@/api/sync";
import { clearAllAppStates } from "@/stores/useAppStore";
import {
  useAppStoreShallow,
  useAudioSettingsStoreShallow,
  useDisplaySettingsStoreShallow,
} from "@/stores/helpers";
import { setNextBootMessage, clearNextBootMessage } from "@/utils/bootMessage";
import { clearPrefetchFlag, forceRefreshCache } from "@/utils/prefetch";
import { AI_MODEL_METADATA } from "@/types/aiModels";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useThemeStore } from "@/stores/useThemeStore";
import { getTranslatedAppName } from "@/utils/i18n";
import {
  uploadBlobWithStorageInstruction,
  type StorageUploadInstruction,
} from "@/utils/storageUpload";
import { getTabStyles } from "@/utils/tabStyles";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { ControlPanelsInitialData } from "@/apps/base/types";
import { triggerRuntimeCrashTest } from "@/utils/errorReporting";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { ApiRequestError } from "@/api/core";
import {
  FILE_SYNC_DOMAINS,
  type CloudSyncDomain,
  getLatestCloudSyncTimestamp,
} from "@/utils/cloudSyncShared";
import { useShallow } from "zustand/react/shallow";
import { useTelegramLink } from "@/hooks/useTelegramLink";
import {
  downloadAndApplyLogicalCloudSyncDomain,
  uploadLogicalCloudSyncDomain,
} from "@/sync/engine";
import {
  LOGICAL_CLOUD_SYNC_DOMAINS,
  getLogicalCloudSyncDomainPhysicalParts,
  isLogicalCloudSyncDomainEnabled,
  type LogicalCloudSyncDomain,
} from "@/utils/syncLogicalDomains";
import {
  collectFullRyOSBackupPayload,
  gzipUtf8String,
  parseRyosFullBackupObject,
  ungzipBase64GzipPayload,
  ungzipToUtf8String,
} from "@/utils/indexedDBBackup";
import { applyRyosFullBackupRestore } from "@/utils/fullBackupRestore";

type PhotoCategory =
  | "3d_graphics"
  | "convergency"
  | "foliage"
  | "landscapes"
  | "nostalgia"
  | "objects"
  | "structures";

const PHOTO_WALLPAPERS: Record<PhotoCategory, string[]> = {
  "3d_graphics": [
    "capsule",
    "capsule_azul",
    "capsule_pistachio",
    "tub",
    "tub_azul",
    "tub_bondi",
    "ufo_1",
    "ufo_2",
    "ufo_3",
  ],
  convergency: Array.from({ length: 15 }, (_, i) => `convergence_${i + 1}`),
  foliage: [
    "blue_flowers",
    "cactus",
    "golden_poppy",
    "red_cyclamens",
    "red_tulips",
    "rose",
    "spider_lily",
    "waterdrops_on_leaf",
    "yellow_tulips",
  ],
  landscapes: [
    "beach",
    "clouds",
    "french_alps",
    "ganges_river",
    "golden_gate_at_dusk",
    "mono_lake",
    "palace_on_lake_in_jaipur",
    "rain_god_mesa",
    "refuge-col_de_la_grasse-alps",
    "zabriskie_point",
  ],
  nostalgia: [
    "acropolis",
    "beach_on_ko_samui",
    "birds_in_flight",
    "cancun_sunset",
    "cliffs_of_moher",
    "fish_eagle",
    "galway_bay",
    "glacier_national_park",
    "highway_395",
    "hong_kong_at_night",
    "islamorada_sunrise",
    "lily_pad",
    "long_island_sound",
    "mac_os_background",
    "midsummer_night",
    "moraine_lake",
    "oasis_in_baja",
    "red_clouds",
    "toronto_skyline",
    "tuolumne_meadows",
    "yosemite_valley",
    "yucatan",
  ],
  objects: [
    "alpine_granite",
    "bicycles",
    "bottles",
    "burmese_claypots",
    "burning_candle",
    "chairs",
    "faucet_handle",
    "neon",
    "salt_shaker_top",
    "shamus",
  ],
  structures: [
    "gate",
    "gate_lock",
    "glass_door_knob",
    "padlock",
    "rusty_lock",
    "shutters",
    "stone_wall",
    "wall_of_stones",
  ],
};

// Transform photo paths
Object.entries(PHOTO_WALLPAPERS).forEach(([category, photos]) => {
  PHOTO_WALLPAPERS[category as PhotoCategory] = photos.map(
    (name) => `/wallpapers/photos/${category}/${name}.jpg`
  );
});

// Use shared AI model metadata
const AI_MODELS = AI_MODEL_METADATA;

/** Maximum cloud backup size in bytes (must match server-side MAX_BACKUP_SIZE) */
const CLOUD_BACKUP_MAX_SIZE = 50 * 1024 * 1024;

export interface UseControlPanelsLogicProps {
  initialData?: ControlPanelsInitialData;
}

export function useControlPanelsLogic({
  initialData,
}: UseControlPanelsLogicProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems(
    "control-panels",
    helpItems
  );
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmFormatOpen, setIsConfirmFormatOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileToRestoreRef = useRef<File | null>(null);
  const { formatFileSystem } = useFileSystem();
  // AI model settings from app store
  const { aiModel, setAiModel } = useAppStoreShallow((s) => ({
    aiModel: s.aiModel,
    setAiModel: s.setAiModel,
  }));

  // Display settings from display settings store
  const {
    debugMode,
    setDebugMode,
    shaderEffectEnabled,
    setShaderEffectEnabled,
    setCurrentWallpaper,
  } = useDisplaySettingsStoreShallow((s) => ({
    debugMode: s.debugMode,
    setDebugMode: s.setDebugMode,
    shaderEffectEnabled: s.shaderEffectEnabled,
    setShaderEffectEnabled: s.setShaderEffectEnabled,
    setCurrentWallpaper: s.setCurrentWallpaper,
  }));

  // Audio settings from audio settings store
  const {
    terminalSoundsEnabled,
    setTerminalSoundsEnabled,
    uiSoundsEnabled,
    setUiSoundsEnabled,
    uiVolume,
    setUiVolume,
    speechEnabled,
    setSpeechEnabled,
    chatSynthVolume,
    setChatSynthVolume,
    speechVolume,
    setSpeechVolume,
    ttsModel,
    setTtsModel,
    ttsVoice,
    setTtsVoice,
    synthPreset,
    setSynthPreset,
    ipodVolume,
    setIpodVolume,
    masterVolume,
    setMasterVolume,
  } = useAudioSettingsStoreShallow((s) => ({
    terminalSoundsEnabled: s.terminalSoundsEnabled,
    setTerminalSoundsEnabled: s.setTerminalSoundsEnabled,
    uiSoundsEnabled: s.uiSoundsEnabled,
    setUiSoundsEnabled: s.setUiSoundsEnabled,
    uiVolume: s.uiVolume,
    setUiVolume: s.setUiVolume,
    speechEnabled: s.speechEnabled,
    setSpeechEnabled: s.setSpeechEnabled,
    chatSynthVolume: s.chatSynthVolume,
    setChatSynthVolume: s.setChatSynthVolume,
    speechVolume: s.speechVolume,
    setSpeechVolume: s.setSpeechVolume,
    ttsModel: s.ttsModel,
    setTtsModel: s.setTtsModel,
    ttsVoice: s.ttsVoice,
    setTtsVoice: s.setTtsVoice,
    synthPreset: s.synthPreset,
    setSynthPreset: s.setSynthPreset,
    ipodVolume: s.ipodVolume,
    setIpodVolume: s.setIpodVolume,
    masterVolume: s.masterVolume,
    setMasterVolume: s.setMasterVolume,
  }));

  // Theme state
  const currentTheme = useThemeStore((state) => state.current);
  const setTheme = useThemeStore((state) => state.setTheme);

  // Language state
  const currentLanguage = useLanguageStore((state) => state.current);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  // Use auth hook
  const {
    username,
    isAuthenticated,
    promptSetUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    hasPassword,
    setPassword,
    logout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
  } = useAuth();

  const {
    autoSyncEnabled,
    syncFiles,
    syncSettings,
    syncSongs,
    syncVideos,
    syncStickies,
    syncCalendar,
    syncContacts,
    isCheckingRemote: isAutoSyncChecking,
    lastCheckedAt: autoSyncLastCheckedAt,
    lastError: autoSyncLastError,
    domainStatus: internalAutoSyncDomainStatus,
    setAutoSyncEnabled,
    setDomainEnabled,
  } = useCloudSyncStore(
    useShallow((state) => ({
      autoSyncEnabled: state.autoSyncEnabled,
      syncFiles: state.syncFiles,
      syncSettings: state.syncSettings,
      syncSongs: state.syncSongs,
      syncVideos: state.syncVideos,
      syncStickies: state.syncStickies,
      syncCalendar: state.syncCalendar,
      syncContacts: state.syncContacts,
      isCheckingRemote: state.isCheckingRemote,
      lastCheckedAt: state.lastCheckedAt,
      lastError: state.lastError,
      domainStatus: state.domainStatus,
      setAutoSyncEnabled: state.setAutoSyncEnabled,
      setDomainEnabled: state.setDomainEnabled,
    }))
  );

  const autoSyncDomainStatus = {
    files: {
      lastUploadedAt: getLatestCloudSyncTimestamp(
        FILE_SYNC_DOMAINS.map(
          (domain) => internalAutoSyncDomainStatus[domain].lastUploadedAt
        )
      ),
      lastFetchedAt: getLatestCloudSyncTimestamp(
        FILE_SYNC_DOMAINS.map(
          (domain) =>
            internalAutoSyncDomainStatus[domain].lastFetchedAt ||
            internalAutoSyncDomainStatus[domain].lastAppliedRemoteAt
        )
      ),
      lastAppliedRemoteAt: getLatestCloudSyncTimestamp(
        FILE_SYNC_DOMAINS.map(
          (domain) => internalAutoSyncDomainStatus[domain].lastAppliedRemoteAt
        )
      ),
      isUploading: FILE_SYNC_DOMAINS.some(
        (domain) => internalAutoSyncDomainStatus[domain].isUploading
      ),
      isDownloading: FILE_SYNC_DOMAINS.some(
        (domain) => internalAutoSyncDomainStatus[domain].isDownloading
      ),
    },
    settings: internalAutoSyncDomainStatus.settings,
    songs: internalAutoSyncDomainStatus.songs,
    videos: internalAutoSyncDomainStatus.videos,
    stickies: internalAutoSyncDomainStatus.stickies,
    calendar: internalAutoSyncDomainStatus.calendar,
    contacts: internalAutoSyncDomainStatus.contacts,
  };

  // Password dialog states
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Log out all devices state
  const [isLoggingOutAllDevices, setIsLoggingOutAllDevices] = useState(false);

  // Password status is now automatically checked by the store when username/token changes

  // Debug hasPassword value
  useEffect(() => {
    console.log(
      "[ControlPanel] hasPassword value:",
      hasPassword,
      "type:",
      typeof hasPassword
    );
  }, [hasPassword]);

  const handleSetPassword = async (password: string) => {
    setIsSettingPassword(true);
    setPasswordError(null);

    if (!password || password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      setIsSettingPassword(false);
      return;
    }

    const result = await setPassword(password);

    if (result.ok) {
      toast.success("Password Set", {
        description: "You can now use your password to recover your account",
      });
      setIsPasswordDialogOpen(false);
      setPasswordInput("");
    } else {
      setPasswordError(result.error || "Failed to set password");
    }

    setIsSettingPassword(false);
  };

  const handleLogoutAllDevices = async () => {
    setIsLoggingOutAllDevices(true);

    try {
      // Ensure we have auth info from the auth hook
      if (!isAuthenticated || !username) {
        toast.error("Authentication Error", {
          description: "Not authenticated",
        });
        return;
      }

      const data = await logoutAllDevices();

      toast.success("Logged Out", {
        description: data.message || "Logged out from all devices",
      });

      // Immediately clear auth via store logout (bypass confirmation)
      confirmLogout();

      // No full page reload needed – UI will update via store reset
    } catch (error) {
      if (error instanceof ApiRequestError) {
        toast.error("Logout Failed", {
          description: error.message || "Failed to logout from all devices",
        });
      } else {
        console.error("Error logging out all devices:", error);
        toast.error("Network Error", {
          description: "Failed to connect to server",
        });
      }
    } finally {
      setIsLoggingOutAllDevices(false);
    }
  };

  const {
    telegramLinkedAccount,
    telegramLinkSession,
    isTelegramStatusLoading,
    isCreatingTelegramLink,
    isDisconnectingTelegramLink,
    refreshTelegramLinkStatus,
    handleCreateTelegramLink,
    handleOpenTelegramLink,
    handleCopyTelegramCode,
    handleDisconnectTelegramLink,
  } = useTelegramLink({ username, isAuthenticated });

  // ====================================================================
  // Cloud Sync state
  // ====================================================================
  const [cloudSyncStatus, setCloudSyncStatus] = useState<{
    hasBackup: boolean;
    metadata: {
      timestamp: string;
      version: number;
      totalSize: number;
      createdAt: string;
    } | null;
  } | null>(null);
  const [isCloudBackingUp, setIsCloudBackingUp] = useState(false);
  const [isCloudRestoring, setIsCloudRestoring] = useState(false);
  const [isCloudForceUploading, setIsCloudForceUploading] = useState(false);
  const [isCloudForceDownloading, setIsCloudForceDownloading] = useState(false);
  const [isConfirmForceUploadOpen, setIsConfirmForceUploadOpen] =
    useState(false);
  const [isConfirmForceDownloadOpen, setIsConfirmForceDownloadOpen] =
    useState(false);
  const isCloudForceSyncing = isCloudForceUploading || isCloudForceDownloading;
  const [isCloudStatusLoading, setIsCloudStatusLoading] = useState(false);
  const [isConfirmCloudRestoreOpen, setIsConfirmCloudRestoreOpen] =
    useState(false);

  /** Cloud backup/restore progress: phase label + 0-100 percentage */
  const [cloudProgress, setCloudProgress] = useState<{
    phase: string;
    percent: number;
  } | null>(null);

  /** Fetch cloud backup status */
  const fetchCloudSyncStatus = useCallback(async () => {
    if (!username || !isAuthenticated) return;

    setIsCloudStatusLoading(true);
    try {
      const data = await fetchCloudSyncStatusApi();
      setCloudSyncStatus(data);
    } catch (error) {
      console.error("[CloudSync] Error fetching status:", error);
    } finally {
      setIsCloudStatusLoading(false);
    }
  }, [username, isAuthenticated]);

  // Fetch cloud sync status when user is logged in
  useEffect(() => {
    if (username && isAuthenticated) {
      fetchCloudSyncStatus();
    } else {
      setCloudSyncStatus(null);
    }
  }, [username, isAuthenticated, fetchCloudSyncStatus]);

  /** Upload current state to cloud */
  const handleCloudBackup = useCallback(async () => {
    if (!username || !isAuthenticated) {
      toast.error(t("apps.control-panels.cloudSync.loginRequired"));
      return;
    }

    setIsCloudBackingUp(true);
    setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.collecting"), percent: 0 });

    try {
      const backup = await collectFullRyOSBackupPayload({
        logPrefix: "[CloudSync]",
        onAfterLocalStorageSnapshot: () =>
          setCloudProgress({
            phase: t("apps.control-panels.cloudSync.progress.collecting"),
            percent: 10,
          }),
        onBeforeIndexedDBSerialize: () =>
          setCloudProgress({
            phase: t("apps.control-panels.cloudSync.progress.serializing"),
            percent: 20,
          }),
      });

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.compressing"),
        percent: 35,
      });

      const combined = await gzipUtf8String(JSON.stringify(backup));

      // Check size before uploading
      if (combined.length > CLOUD_BACKUP_MAX_SIZE) {
        const sizeMB = (combined.length / (1024 * 1024)).toFixed(1);
        const limitMB = (CLOUD_BACKUP_MAX_SIZE / (1024 * 1024)).toFixed(0);
        toast.error(
          t("apps.control-panels.cloudSync.tooLarge", {
            size: sizeMB,
            limit: limitMB,
          })
        );
        return;
      }

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.uploading"), percent: 50 });

      // Step 1: Get a client token for direct Vercel Blob upload
      const uploadInstruction = (await requestCloudBackupUploadInstruction()) as StorageUploadInstruction;
      const compressedBlob = new Blob([combined], { type: "application/gzip" });
      const uploadResult = await uploadBlobWithStorageInstruction(
        compressedBlob,
        uploadInstruction,
        (progress) => {
          const overallPercent = 50 + (progress.percentage * 40) / 100;
          setCloudProgress({
            phase: t("apps.control-panels.cloudSync.progress.uploading"),
            percent: Math.round(overallPercent),
          });
        }
      );

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.finishing"), percent: 92 });

      // Step 3: Save metadata to server
      await saveCloudBackupMetadata({
        storageUrl: uploadResult.storageUrl,
        timestamp: backup.timestamp,
        version: backup.version,
        totalSize: combined.length,
      });

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.finishing"), percent: 98 });
      setCloudProgress({ phase: t("apps.control-panels.cloudSync.backupSuccess"), percent: 100 });
      toast.success(t("apps.control-panels.cloudSync.backupSuccess"));
      await fetchCloudSyncStatus();
    } catch (error) {
      console.error("[CloudSync] Backup error:", error);
      toast.error(t("apps.control-panels.cloudSync.backupFailed"));
    } finally {
      setIsCloudBackingUp(false);
      // Clear progress after a short delay so user can see completion
      setTimeout(() => setCloudProgress(null), 1500);
    }
  }, [username, isAuthenticated, t, fetchCloudSyncStatus]);

  /** Force-upload enabled auto sync domains so local state wins. */
  const handleCloudForceUpload = useCallback(async () => {
    if (!username || !isAuthenticated) {
      toast.error(t("apps.control-panels.cloudSync.loginRequired"));
      return;
    }

    const syncStore = useCloudSyncStore.getState();
    const enabledDomains = LOGICAL_CLOUD_SYNC_DOMAINS.filter((domain) =>
      isLogicalCloudSyncDomainEnabled(syncStore.isDomainEnabled, domain)
    );

    if (enabledDomains.length === 0) {
      toast.error(t("apps.control-panels.cloudSync.forceSyncNoDomains"));
      return;
    }

    setIsCloudForceUploading(true);

    const failures: string[] = [];
    const markLogicalUploadFailure = (
      domain: LogicalCloudSyncDomain,
      message: string
    ) => {
      for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(domain)) {
        syncStore.markUploadFailure(partDomain, message);
      }
    };

    try {
      for (const domain of enabledDomains) {
        for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(domain)) {
          syncStore.markUploadStart(partDomain);
        }

        try {
          const result = await uploadLogicalCloudSyncDomain(domain, {
            username,
            isAuthenticated,
          });

          for (const [partDomain, metadata] of Object.entries(
            result.partMetadata
          ) as Array<[CloudSyncDomain, NonNullable<(typeof result.partMetadata)[CloudSyncDomain]>]>) {
            syncStore.markUploadSuccess(partDomain, metadata);
            syncStore.updateRemoteMetadataForDomain(partDomain, metadata);
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : t("apps.control-panels.cloudSync.forceUploadFailed");
          failures.push(message);
          markLogicalUploadFailure(domain, message);
        }
      }

      if (failures.length > 0) {
        toast.error(t("apps.control-panels.cloudSync.forceUploadFailed"), {
          description: failures[0],
        });
        return;
      }

      toast.success(t("apps.control-panels.cloudSync.forceUploadSuccess"));
    } finally {
      setIsCloudForceUploading(false);
    }
  }, [isAuthenticated, t, username]);

  /** Force-download enabled auto sync domains so cloud state wins. */
  const handleCloudForceDownload = useCallback(async () => {
    if (!username || !isAuthenticated) {
      toast.error(t("apps.control-panels.cloudSync.loginRequired"));
      return;
    }

    const syncStore = useCloudSyncStore.getState();
    const enabledDomains = LOGICAL_CLOUD_SYNC_DOMAINS.filter((domain) =>
      isLogicalCloudSyncDomainEnabled(syncStore.isDomainEnabled, domain)
    );

    if (enabledDomains.length === 0) {
      toast.error(t("apps.control-panels.cloudSync.forceSyncNoDomains"));
      return;
    }

    setIsCloudForceDownloading(true);

    const failures: string[] = [];
    let appliedCount = 0;
    const markLogicalDownloadFailure = (
      domain: LogicalCloudSyncDomain,
      message: string
    ) => {
      for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(domain)) {
        syncStore.markDownloadFailure(partDomain, message);
      }
    };

    const isNoDataError = (msg: string) =>
      /no \w+ state found/i.test(msg) ||
      msg === "Sync download response was invalid." ||
      msg === "State download response was invalid.";

    try {
      for (const domain of enabledDomains) {
        for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(domain)) {
          syncStore.markDownloadStart(partDomain);
        }

        try {
          const result = await downloadAndApplyLogicalCloudSyncDomain(domain);

          for (const [partDomain, metadata] of Object.entries(
            result.partMetadata
          ) as Array<[CloudSyncDomain, NonNullable<(typeof result.partMetadata)[CloudSyncDomain]>]>) {
            syncStore.updateRemoteMetadataForDomain(partDomain, metadata);
            syncStore.markDownloadSuccess(partDomain, metadata);
            if (result.applied) {
              syncStore.markRemoteApplied(partDomain, metadata);
            }
          }

          if (result.applied) {
            appliedCount++;
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : t("apps.control-panels.cloudSync.forceDownloadFailed");
          if (isNoDataError(message)) {
            for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(domain)) {
              syncStore.markDownloadSuccess(
                partDomain,
                new Date().toISOString()
              );
            }
          } else {
            markLogicalDownloadFailure(domain, message);
            failures.push(message);
          }
        }
      }

      if (failures.length > 0) {
        toast.error(t("apps.control-panels.cloudSync.forceDownloadFailed"), {
          description: failures[0],
        });
        return;
      }

      if (appliedCount === 0) {
        toast.info(t("apps.control-panels.cloudSync.forceDownloadNoData"));
        return;
      }

      toast.success(t("apps.control-panels.cloudSync.forceDownloadSuccess"));
    } finally {
      setIsCloudForceDownloading(false);
    }
  }, [isAuthenticated, t, username]);

  /** Download and restore backup from cloud */
  const handleCloudRestore = useCallback(async () => {
    if (!username || !isAuthenticated) {
      toast.error(t("apps.control-panels.cloudSync.loginRequired"));
      return;
    }

    setIsCloudRestoring(true);
    setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.downloading"), percent: 0 });

    try {
      // Download backup from cloud using XHR for progress
      const downloadResult = await new Promise<{ ok: boolean; data: unknown }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const url = getCloudBackupDownloadUrl();
        xhr.open("GET", url, true);
        xhr.withCredentials = true;
        xhr.timeout = 120000;

        xhr.onprogress = (event) => {
          if (event.lengthComputable) {
            const downloadPercent = (event.loaded / event.total) * 100;
            const overallPercent = (downloadPercent * 40) / 100;
            setCloudProgress({
              phase: t("apps.control-panels.cloudSync.progress.downloading"),
              percent: Math.round(overallPercent),
            });
          }
        };

        xhr.onload = () => {
          let data: unknown;
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            data = {};
          }
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
        };

        xhr.onerror = () => reject(new Error("Network error during download"));
        xhr.ontimeout = () => reject(new Error("Download timed out"));

        xhr.send();
      });

      if (!downloadResult.ok) {
        const errorMsg =
          (downloadResult.data as { error?: string })?.error ||
          t("apps.control-panels.cloudSync.restoreFailed");
        toast.error(errorMsg);
        return;
      }

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.decompressing"), percent: 45 });

      const result = downloadResult.data as { data: string };
      const jsonString = await ungzipBase64GzipPayload(result.data);

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.restoring"), percent: 55 });

      const backup = parseRyosFullBackupObject(JSON.parse(jsonString), "cloud");

      await applyRyosFullBackupRestore(backup, {
        setCurrentWallpaper,
        logPrefix: "[CloudSync]",
        logFilesNormalizeError: (e) =>
          console.error("[CloudSync] Files store fallback failed:", e),
        onAfterClearState: () =>
          setCloudProgress({
            phase: t("apps.control-panels.cloudSync.progress.restoring"),
            percent: 65,
          }),
        onAfterLocalStorage: () =>
          setCloudProgress({
            phase: t("apps.control-panels.cloudSync.progress.restoring"),
            percent: 75,
          }),
        onAfterIndexedDB: () =>
          setCloudProgress({
            phase: t("apps.control-panels.cloudSync.progress.finishing"),
            percent: 90,
          }),
        onAfterWallpaperAndNormalize: () =>
          setCloudProgress({
            phase: t("apps.control-panels.cloudSync.progress.finishing"),
            percent: 100,
          }),
      });

      setNextBootMessage(t("common.system.restoringSystem"));

      // Reload the page to apply changes
      window.location.reload();
    } catch (error) {
      console.error("[CloudSync] Restore error:", error);
      toast.error(t("apps.control-panels.cloudSync.restoreFailed"));
      clearNextBootMessage();
    } finally {
      setIsCloudRestoring(false);
      setCloudProgress(null);
    }
  }, [username, isAuthenticated, t, setCurrentWallpaper]);

  // States for previous volume levels for mute/unmute functionality
  const [prevMasterVolume, setPrevMasterVolume] = useState(
    masterVolume > 0 ? masterVolume : 1
  );
  const [prevUiVolume, setPrevUiVolume] = useState(uiVolume > 0 ? uiVolume : 1);
  const [prevSpeechVolume, setPrevSpeechVolume] = useState(
    speechVolume > 0 ? speechVolume : 1
  );
  const [prevChatSynthVolume, setPrevChatSynthVolume] = useState(
    chatSynthVolume > 0 ? chatSynthVolume : 1
  );
  const [prevIpodVolume, setPrevIpodVolume] = useState(
    ipodVolume > 0 ? ipodVolume : 1
  );

  // Detect iOS Safari – volume API does not work for YouTube embeds there
  const isIOS =
    typeof navigator !== "undefined" &&
    /iP(hone|od|ad)/.test(navigator.userAgent);

  const handleUISoundsChange = (enabled: boolean) => {
    setUiSoundsEnabled(enabled);
  };

  const handleSpeechChange = (enabled: boolean) => {
    setSpeechEnabled(enabled);
  };

  const handleSynthPresetChange = (value: string) => {
    setSynthPreset(value);
  };

  // Mute toggle handlers
  const handleMasterMuteToggle = () => {
    if (masterVolume > 0) {
      setPrevMasterVolume(masterVolume);
      setMasterVolume(0);
    } else {
      setMasterVolume(prevMasterVolume);
    }
  };

  const handleUiMuteToggle = () => {
    if (uiVolume > 0) {
      setPrevUiVolume(uiVolume);
      setUiVolume(0);
    } else {
      setUiVolume(prevUiVolume);
    }
  };

  const handleSpeechMuteToggle = () => {
    if (speechVolume > 0) {
      setPrevSpeechVolume(speechVolume);
      setSpeechVolume(0);
    } else {
      setSpeechVolume(prevSpeechVolume);
    }
  };

  const handleChatSynthMuteToggle = () => {
    if (chatSynthVolume > 0) {
      setPrevChatSynthVolume(chatSynthVolume);
      setChatSynthVolume(0);
    } else {
      setChatSynthVolume(prevChatSynthVolume);
    }
  };

  const handleIpodMuteToggle = () => {
    if (isIOS) return;
    if (ipodVolume > 0) {
      setPrevIpodVolume(ipodVolume);
      setIpodVolume(0);
    } else {
      setIpodVolume(prevIpodVolume);
    }
  };

  const handleResetAll = () => {
    setIsConfirmResetOpen(true);
  };

  const handleConfirmReset = () => {
    setIsConfirmResetOpen(false);
    setNextBootMessage(t("common.system.resettingSystem"));
    performReset();
  };

  const performReset = () => {
    // Preserve critical recovery keys while clearing everything else
    const fileMetadataStore = localStorage.getItem("ryos:files");
    const usernameRecovery = localStorage.getItem("_usr_recovery_key_");

    clearAllAppStates();
    clearPrefetchFlag(); // Force re-prefetch on next boot

    if (fileMetadataStore) {
      localStorage.setItem("ryos:files", fileMetadataStore);
    }
    if (usernameRecovery) {
      localStorage.setItem("_usr_recovery_key_", usernameRecovery);
    }

    window.location.reload();
  };

  const handleBackup = async () => {
    const backup = await collectFullRyOSBackupPayload({
      onIndexedDBBackupError: () =>
        alert(t("apps.control-panels.alerts.failedToBackupFileSystem")),
    });

    const jsonString = JSON.stringify(backup);

    try {
      const compressedBlob = new Blob([await gzipUtf8String(jsonString)], {
        type: "application/gzip",
      });

      // Create download link
      const url = URL.createObjectURL(compressedBlob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .split("T")
        .join("-")
        .slice(0, -5);
      a.download = `ryOS-backup-${timestamp}.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (compressionError) {
      console.error("Compression failed:", compressionError);
      alert(t("apps.control-panels.alerts.failedToCreateBackup", {
        error: compressionError instanceof Error ? compressionError.message : t("apps.control-panels.alerts.unknownError"),
      }));
    }
  };

  const handleRestore = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    fileToRestoreRef.current = file;
    performRestore();
  };

  const performRestore = async () => {
    const file = fileToRestoreRef.current;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let data: string;

        if (file.name.endsWith(".gz")) {
          try {
            data = await ungzipToUtf8String(
              e.target?.result as ArrayBuffer
            );
          } catch (decompressionError) {
            console.error("Decompression failed:", decompressionError);
            throw new Error(
              `Failed to decompress backup file: ${
                decompressionError instanceof Error
                  ? decompressionError.message
                  : "Unknown error"
              }`
            );
          }
        } else {
          data = e.target?.result as string;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch (parseError) {
          console.error("JSON parse error:", parseError);
          throw new Error(
            "Invalid JSON format. The backup file may be corrupted."
          );
        }

        const backup = parseRyosFullBackupObject(parsed, "local");

        await applyRyosFullBackupRestore(backup, {
          setCurrentWallpaper,
          onIndexedDBRestoreError: () =>
            alert(t("apps.control-panels.alerts.failedToRestoreFileSystem")),
          logFilesNormalizeError: (fallbackErr) =>
            console.error(
              "[ControlPanels] Emergency fallback failed:",
              fallbackErr
            ),
        });

        setNextBootMessage(t("common.system.restoringSystem"));

        // Reload the page to apply changes
        window.location.reload();
      } catch (err) {
        console.error("Restore failed:", err);

        const detail = err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : t("apps.control-panels.alerts.unknownError");
        alert(t("apps.control-panels.alerts.failedToRestoreBackup", { error: detail }));
        clearNextBootMessage();
      }
    };

    if (file.name.endsWith(".gz")) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
    fileToRestoreRef.current = null;
  };

  const performFormat = async () => {
    // Reset wallpaper to default before formatting
    setCurrentWallpaper("/wallpapers/photos/aqua/water.jpg");
    await formatFileSystem();
    clearPrefetchFlag(); // Force re-prefetch on next boot
    setNextBootMessage(t("common.system.formattingFileSystem"));
    window.location.reload();
  };

  const handleConfirmFormat = () => {
    setIsConfirmFormatOpen(false);
    setNextBootMessage(t("common.system.formattingFileSystem"));
    performFormat();
  };

  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOSXTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";
  const isClassicMacTheme = isMacOSXTheme || isSystem7Theme;
  const isWindowsLegacyTheme = isXpTheme;

  const tabStyles = getTabStyles(currentTheme);
  const defaultTab = initialData?.defaultTab || "appearance";
  const windowTitle = getTranslatedAppName("control-panels");

  const handleCheckForUpdates = () => {
    forceRefreshCache();
  };

  const handleShowBootScreen = () => {
    setNextBootMessage(t("common.system.debugBootScreenTest"), true);
    window.location.reload();
  };

  const handleTriggerAppCrashTest = useCallback(() => {
    triggerRuntimeCrashTest({
      scope: "app",
      appId: "control-panels",
    });
  }, []);

  const handleTriggerDesktopCrashTest = useCallback(() => {
    triggerRuntimeCrashTest({
      scope: "desktop",
    });
  }, []);

  return {
    t,
    translatedHelpItems,
    windowTitle,
    defaultTab,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isConfirmResetOpen,
    setIsConfirmResetOpen,
    isConfirmFormatOpen,
    setIsConfirmFormatOpen,
    isPasswordDialogOpen,
    setIsPasswordDialogOpen,
    passwordInput,
    setPasswordInput,
    passwordError,
    setPasswordError,
    isSettingPassword,
    isLoggingOutAllDevices,
    fileInputRef,
    handleRestore,
    handleBackup,
    handleResetAll,
    handleConfirmReset,
    handleConfirmFormat,
    handleCheckForUpdates,
    handleShowBootScreen,
    handleTriggerAppCrashTest,
    handleTriggerDesktopCrashTest,
    AI_MODELS,
    aiModel,
    setAiModel,
    debugMode,
    setDebugMode,
    shaderEffectEnabled,
    setShaderEffectEnabled,
    currentTheme,
    setTheme,
    currentLanguage,
    setLanguage,
    tabStyles,
    isXpTheme,
    isMacOSXTheme,
    isClassicMacTheme,
    isWindowsLegacyTheme,
    uiSoundsEnabled,
    handleUISoundsChange,
    speechEnabled,
    handleSpeechChange,
    terminalSoundsEnabled,
    setTerminalSoundsEnabled,
    synthPreset,
    handleSynthPresetChange,
    masterVolume,
    setMasterVolume,
    setPrevMasterVolume,
    handleMasterMuteToggle,
    uiVolume,
    setUiVolume,
    setPrevUiVolume,
    handleUiMuteToggle,
    speechVolume,
    setSpeechVolume,
    setPrevSpeechVolume,
    handleSpeechMuteToggle,
    chatSynthVolume,
    setChatSynthVolume,
    setPrevChatSynthVolume,
    handleChatSynthMuteToggle,
    ipodVolume,
    setIpodVolume,
    setPrevIpodVolume,
    handleIpodMuteToggle,
    isIOS,
    ttsModel,
    setTtsModel,
    ttsVoice,
    setTtsVoice,
    username,
    promptSetUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    hasPassword,
    logout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
    handleSetPassword,
    handleLogoutAllDevices,
    telegramLinkedAccount,
    telegramLinkSession,
    isTelegramStatusLoading,
    isCreatingTelegramLink,
    isDisconnectingTelegramLink,
    refreshTelegramLinkStatus,
    handleCreateTelegramLink,
    handleOpenTelegramLink,
    handleCopyTelegramCode,
    handleDisconnectTelegramLink,
    autoSyncEnabled,
    setAutoSyncEnabled,
    syncFiles,
    syncSettings,
    syncSongs,
    syncVideos,
    syncStickies,
    syncCalendar,
    syncContacts,
    setSyncFiles: (enabled: boolean) =>
      setDomainEnabled("files-metadata", enabled),
    setSyncSettings: (enabled: boolean) =>
      setDomainEnabled("settings", enabled),
    setSyncSongs: (enabled: boolean) => setDomainEnabled("songs", enabled),
    setSyncVideos: (enabled: boolean) => setDomainEnabled("videos", enabled),
    setSyncStickies: (enabled: boolean) =>
      setDomainEnabled("stickies", enabled),
    setSyncCalendar: (enabled: boolean) =>
      setDomainEnabled("calendar", enabled),
    setSyncContacts: (enabled: boolean) =>
      setDomainEnabled("contacts", enabled),
    isAutoSyncChecking,
    autoSyncLastCheckedAt,
    autoSyncLastError,
    autoSyncDomainStatus,
    // Cloud Sync
    cloudSyncStatus,
    isCloudBackingUp,
    isCloudRestoring,
    isCloudForceSyncing,
    isCloudForceUploading,
    isCloudForceDownloading,
    isCloudStatusLoading,
    isConfirmCloudRestoreOpen,
    setIsConfirmCloudRestoreOpen,
    isConfirmForceUploadOpen,
    setIsConfirmForceUploadOpen,
    isConfirmForceDownloadOpen,
    setIsConfirmForceDownloadOpen,
    handleCloudForceUpload,
    handleCloudForceDownload,
    handleCloudBackup,
    handleCloudRestore,
    cloudProgress,
    CLOUD_BACKUP_MAX_SIZE,
  };
}
