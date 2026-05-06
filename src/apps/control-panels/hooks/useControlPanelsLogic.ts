import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { helpItems } from "..";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { clearAllAppStates } from "@/stores/useAppStore";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
import {
  useAppStoreShallow,
  useAudioSettingsStoreShallow,
  useDisplaySettingsStoreShallow,
} from "@/stores/helpers";
import { DEFAULT_WALLPAPER_PATH } from "@/stores/useDisplaySettingsStore";
import { setNextBootMessage, clearNextBootMessage } from "@/utils/bootMessage";
import { clearPrefetchFlag, forceRefreshCache } from "@/utils/prefetch";
import { AI_MODEL_METADATA } from "@/types/aiModels";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useThemeStore } from "@/stores/useThemeStore";
import { getApiUrl } from "@/utils/platform";
import { getTranslatedAppName } from "@/utils/i18n";
import {
  uploadBlobWithStorageInstruction,
  type StorageUploadInstruction,
} from "@/utils/storageUpload";
import { getTabStyles } from "@/utils/tabStyles";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { ControlPanelsInitialData } from "@/apps/base/types";
import { abortableFetch } from "@/utils/abortableFetch";
import { triggerRuntimeCrashTest } from "@/utils/errorReporting";
import { SETTINGS_ANALYTICS, track } from "@/utils/analytics";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
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
  readStoreItems,
  restoreStoreItems,
  serializeStoreItems,
  type IndexedDBStoreItemWithKey as StoreItemWithKey,
} from "@/utils/indexedDBBackup";

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

const BACKUP_INDEXEDDB_STORES = [
  "documents",
  "images",
  "trash",
  "custom_wallpapers",
  "applets",
] as const;

function upgradeLegacyBackupStoreValue(
  backupVersion: number,
  storeName: string,
  value: Record<string, unknown>
): Record<string, unknown> {
  if (
    backupVersion >= 2 ||
    (storeName !== "documents" && storeName !== "images")
  ) {
    return value;
  }

  const nextValue = { ...value };
  if (!nextValue.uuid) {
    nextValue.uuid = uuidv4();
  }
  if (!nextValue.contentUrl && nextValue.content instanceof Blob) {
    nextValue.contentUrl = URL.createObjectURL(nextValue.content);
  }
  return nextValue;
}

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
    syncTv,
    syncStickies,
    syncCalendar,
    syncContacts,
    syncMaps,
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
      syncTv: state.syncTv,
      syncStickies: state.syncStickies,
      syncCalendar: state.syncCalendar,
      syncContacts: state.syncContacts,
      syncMaps: state.syncMaps,
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
          (domain) =>
            internalAutoSyncDomainStatus[domain]?.lastUploadedAt ?? null
        )
      ),
      lastFetchedAt: getLatestCloudSyncTimestamp(
        FILE_SYNC_DOMAINS.map(
          (domain) =>
            internalAutoSyncDomainStatus[domain]?.lastFetchedAt ||
            internalAutoSyncDomainStatus[domain]?.lastAppliedRemoteAt ||
            null
        )
      ),
      lastAppliedRemoteAt: getLatestCloudSyncTimestamp(
        FILE_SYNC_DOMAINS.map(
          (domain) =>
            internalAutoSyncDomainStatus[domain]?.lastAppliedRemoteAt ?? null
        )
      ),
      isUploading: FILE_SYNC_DOMAINS.some(
        (domain) => internalAutoSyncDomainStatus[domain]?.isUploading ?? false
      ),
      isDownloading: FILE_SYNC_DOMAINS.some(
        (domain) => internalAutoSyncDomainStatus[domain]?.isDownloading ?? false
      ),
    },
    settings: internalAutoSyncDomainStatus.settings,
    songs: internalAutoSyncDomainStatus.songs,
    videos: internalAutoSyncDomainStatus.videos,
    tv: internalAutoSyncDomainStatus.tv,
    stickies: internalAutoSyncDomainStatus.stickies,
    calendar: internalAutoSyncDomainStatus.calendar,
    contacts: internalAutoSyncDomainStatus.contacts,
    maps: internalAutoSyncDomainStatus.maps,
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

      const response = await abortableFetch(getApiUrl("/api/auth/logout-all"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Logged Out", {
          description: data.message || "Logged out from all devices",
        });

        // Immediately clear auth via store logout (bypass confirmation)
        confirmLogout();

        // No full page reload needed – UI will update via store reset
      } else {
        toast.error("Logout Failed", {
          description: data.error || "Failed to logout from all devices",
        });
      }
    } catch (error) {
      console.error("Error logging out all devices:", error);
      toast.error("Network Error", {
        description: "Failed to connect to server",
      });
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
      const response = await abortableFetch(getApiUrl("/api/sync/status"), {
        method: "GET",
        headers: {},
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 2, initialDelayMs: 500 },
      });

      if (response.ok) {
        const data = await response.json();
        setCloudSyncStatus(data);
      }
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
      // Build the same backup structure used for local backup
      const backup: {
        localStorage: Record<string, string | null>;
        indexedDB: {
          documents: StoreItemWithKey[];
          images: StoreItemWithKey[];
          trash: StoreItemWithKey[];
          custom_wallpapers: StoreItemWithKey[];
          applets: StoreItemWithKey[];
        };
        timestamp: string;
        version: number;
      } = {
        localStorage: {},
        indexedDB: {
          documents: [],
          images: [],
          trash: [],
          custom_wallpapers: [],
          applets: [],
        },
        timestamp: new Date().toISOString(),
        version: 3,
      };

      // Backup all localStorage data
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          backup.localStorage[key] = localStorage.getItem(key);
        }
      }

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.collecting"), percent: 10 });

      // Backup IndexedDB data
      try {
        const db = await ensureIndexedDBInitialized();

        setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.serializing"), percent: 20 });
        const serializedStores = await Promise.all(
          BACKUP_INDEXEDDB_STORES.map(async (storeName) => [
            storeName,
            await serializeStoreItems(await readStoreItems(db, storeName)),
          ] as const)
        );
        for (const [storeName, items] of serializedStores) {
          backup.indexedDB[storeName] = items;
        }
        db.close();
      } catch (error) {
        console.error("[CloudSync] Error backing up IndexedDB:", error);
      }

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.compressing"), percent: 35 });

      // Convert to JSON and compress
      const jsonString = JSON.stringify(backup);
      const encoder = new TextEncoder();
      const inputData = encoder.encode(jsonString);

      // Gzip compress
      const readableStream = new ReadableStream({
        start(controller) {
          controller.enqueue(inputData);
          controller.close();
        },
      });
      const compressionStream = new CompressionStream("gzip");
      const compressedStream = readableStream.pipeThrough(compressionStream);
      const chunks: Uint8Array[] = [];
      const reader = compressedStream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks into a single buffer
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

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
      const tokenUrl = getApiUrl("/api/sync/backup-token");
      const tokenRes = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!tokenRes.ok) {
        const tokenError = await tokenRes.json().catch(() => ({}));
        throw new Error(
          (tokenError as { error?: string })?.error || "Failed to get upload token"
        );
      }

      const uploadInstruction = (await tokenRes.json()) as StorageUploadInstruction;
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
      const metaUrl = getApiUrl("/api/sync/backup");
      const metaRes = await fetch(metaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storageUrl: uploadResult.storageUrl,
          timestamp: backup.timestamp,
          version: backup.version,
          totalSize: combined.length,
        }),
      });

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.finishing"), percent: 98 });

      if (metaRes.ok) {
        setCloudProgress({ phase: t("apps.control-panels.cloudSync.backupSuccess"), percent: 100 });
        toast.success(t("apps.control-panels.cloudSync.backupSuccess"));
        await fetchCloudSyncStatus();
      } else {
        const errorData = await metaRes.json().catch(() => ({}));
        const errorMsg =
          (errorData as { error?: string })?.error ||
          t("apps.control-panels.cloudSync.backupFailed");
        toast.error(errorMsg);
      }
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
          const result = await uploadLogicalCloudSyncDomain(
            domain,
            {
              username,
              isAuthenticated,
            },
            undefined,
            { forceFullSettingsUpload: true }
          );

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
        const url = getApiUrl("/api/sync/backup");
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
      const base64Data = result.data;

      // Decode base64 to Uint8Array
      const binaryStr = atob(base64Data);
      const compressedData = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        compressedData[i] = binaryStr.charCodeAt(i);
      }

      // Decompress gzip
      const compressedResponse = new Response(compressedData);
      const compressedStreamBody = compressedResponse.body;
      if (!compressedStreamBody) {
        throw new Error("Failed to create stream from compressed data");
      }
      const decompressionStream = new DecompressionStream("gzip");
      const decompressedStream =
        compressedStreamBody.pipeThrough(decompressionStream);
      const decompressedResponse = new Response(decompressedStream);
      const jsonString = await decompressedResponse.text();

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.restoring"), percent: 55 });

      // Parse backup
      const backup = JSON.parse(jsonString);

      if (!backup || !backup.localStorage || !backup.timestamp) {
        throw new Error("Invalid backup format");
      }

      // Clear current state
      clearAllAppStates();
      clearPrefetchFlag();

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.restoring"), percent: 65 });

      // Restore localStorage
      Object.entries(backup.localStorage).forEach(([key, value]) => {
        if (value !== null) {
          localStorage.setItem(key, value as string);
        }
      });

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.restoring"), percent: 75 });

      // Restore IndexedDB data if available
      if (backup.indexedDB) {
        try {
          const db = await ensureIndexedDBInitialized();
          const restorePromises = BACKUP_INDEXEDDB_STORES.flatMap((storeName) => {
            const items = backup.indexedDB?.[storeName];
            if (!items) {
              return [];
            }

            return restoreStoreItems(db, storeName, items, {
              mapValue: (value) =>
                upgradeLegacyBackupStoreValue(backup.version, storeName, value),
            });
          });

          await Promise.all(restorePromises);
          db.close();
        } catch (error) {
          console.error("[CloudSync] Error restoring IndexedDB:", error);
        }
      }

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.finishing"), percent: 90 });

      // Handle wallpaper restore
      if (backup.localStorage["ryos:app:settings:wallpaper"]) {
        const wallpaper = backup.localStorage["ryos:app:settings:wallpaper"];
        if (wallpaper) {
          setCurrentWallpaper(wallpaper);
        }
      }

      // Ensure files store is in a safe state.
      // Preserve the version from the backup so Zustand doesn't
      // re-run migrations on already-current data.
      try {
        const persistedKey = "ryos:files";
        const persistedState = localStorage.getItem(persistedKey);
        if (persistedState) {
          const parsed = JSON.parse(persistedState);
          if (parsed?.state) {
            const hasItems =
              parsed.state.items &&
              Object.keys(parsed.state.items).length > 0;
            parsed.state.libraryState = hasItems ? "loaded" : "uninitialized";
            if (!parsed.version || parsed.version < 5) {
              parsed.version = 5;
            }
            localStorage.setItem(persistedKey, JSON.stringify(parsed));
          }
        }
      } catch (fallbackErr) {
        console.error("[CloudSync] Files store fallback failed:", fallbackErr);
      }

      setCloudProgress({ phase: t("apps.control-panels.cloudSync.progress.finishing"), percent: 100 });

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
    track(SETTINGS_ANALYTICS.RESET, {
      appId: "control-panels",
      action: "reset_all",
    });
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
    const backup: {
      localStorage: Record<string, string | null>;
      indexedDB: {
        documents: StoreItemWithKey[];
        images: StoreItemWithKey[];
        trash: StoreItemWithKey[];
        custom_wallpapers: StoreItemWithKey[];
        applets: StoreItemWithKey[];
      };
      timestamp: string;
      version: number; // Add version to identify backup format
    } = {
      localStorage: {},
      indexedDB: {
        documents: [],
        images: [],
        trash: [],
        custom_wallpapers: [],
        applets: [],
      },
      timestamp: new Date().toISOString(),
      version: 3, // Version 3 includes applets support
    };

    // Backup all localStorage data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        backup.localStorage[key] = localStorage.getItem(key);
      }
    }

    // Backup IndexedDB data
    try {
      const db = await ensureIndexedDBInitialized();
      const serializedStores = await Promise.all(
        BACKUP_INDEXEDDB_STORES.map(async (storeName) => [
          storeName,
          await serializeStoreItems(await readStoreItems(db, storeName)),
        ] as const)
      );
      for (const [storeName, items] of serializedStores) {
        backup.indexedDB[storeName] = items;
      }
      db.close();
    } catch (error) {
      console.error("Error backing up IndexedDB:", error);
      alert(t("apps.control-panels.alerts.failedToBackupFileSystem"));
    }

    // Convert to JSON string
    const jsonString = JSON.stringify(backup);

    // Create download with gzip compression
    try {
      // Check if CompressionStream is available
      if (typeof CompressionStream === "undefined") {
        throw new Error("CompressionStream API not available in this browser");
      }

      // Convert string to Uint8Array for compression
      const encoder = new TextEncoder();
      const inputData = encoder.encode(jsonString);

      // Create a ReadableStream from the data
      const readableStream = new ReadableStream({
        start(controller) {
          controller.enqueue(inputData);
          controller.close();
        },
      });

      // Compress the stream
      const compressionStream = new CompressionStream("gzip");
      const compressedStream = readableStream.pipeThrough(compressionStream);

      // Convert the compressed stream to a blob
      const chunks: Uint8Array[] = [];
      const reader = compressedStream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks into a single blob
      const compressedBlob = new Blob(chunks as BlobPart[], {
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
            const arrayBuffer = e.target?.result as ArrayBuffer;

            // Create a Response object with the compressed data
            const compressedResponse = new Response(arrayBuffer);
            const compressedStream = compressedResponse.body;

            if (!compressedStream) {
              throw new Error("Failed to create stream from compressed data");
            }

            // Decompress the stream
            const decompressionStream = new DecompressionStream("gzip");
            const decompressedStream =
              compressedStream.pipeThrough(decompressionStream);

            // Read the decompressed data
            const decompressedResponse = new Response(decompressedStream);
            data = await decompressedResponse.text();
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

        // Try to parse the JSON
        let backup;
        try {
          backup = JSON.parse(data);
        } catch (parseError) {
          console.error("JSON parse error:", parseError);
          throw new Error(
            "Invalid JSON format. The backup file may be corrupted."
          );
        }

        // Validate backup structure
        if (!backup || !backup.localStorage || !backup.timestamp) {
          throw new Error(
            "Invalid backup format. Missing required backup data."
          );
        }

        track(SETTINGS_ANALYTICS.RESET, {
          appId: "control-panels",
          action: "restore_backup",
          compressed: file.name.endsWith(".gz"),
        });

        // Clear current state
        clearAllAppStates();
        clearPrefetchFlag(); // Force re-prefetch on next boot

        // Restore localStorage
        Object.entries(backup.localStorage).forEach(([key, value]) => {
          if (value !== null) {
            localStorage.setItem(key, value as string);
          }
        });

        // Restore IndexedDB data if available
        if (backup.indexedDB) {
          try {
            const db = await ensureIndexedDBInitialized();
            const restorePromises = BACKUP_INDEXEDDB_STORES.flatMap((storeName) => {
              const items = backup.indexedDB?.[storeName];
              if (!items) {
                return [];
              }

              return restoreStoreItems(db, storeName, items, {
                mapValue: (value) =>
                  upgradeLegacyBackupStoreValue(backup.version, storeName, value),
              });
            });

            await Promise.all(restorePromises);
            db.close();
          } catch (error) {
            console.error("Error restoring IndexedDB:", error);
            alert(t("apps.control-panels.alerts.failedToRestoreFileSystem"));
          }
        }

        // Update wallpaper after restore
        if (backup.localStorage["ryos:app:settings:wallpaper"]) {
          const wallpaper = backup.localStorage["ryos:app:settings:wallpaper"];
          if (wallpaper) {
            setCurrentWallpaper(wallpaper);
          }
        }

        try {
          // Ensure the files store is in a safe state after restore.
          // Preserve the version from the backup so Zustand doesn't
          // re-run migrations on already-current data.
          const persistedKey = "ryos:files";
          const persistedState = localStorage.getItem(persistedKey);

          if (persistedState) {
            const parsed = JSON.parse(persistedState);
            if (parsed && parsed.state) {
              const hasItems =
                parsed.state.items &&
                Object.keys(parsed.state.items).length > 0;
              parsed.state.libraryState = hasItems
                ? "loaded"
                : "uninitialized";
              if (!parsed.version || parsed.version < 5) {
                parsed.version = 5;
              }
              localStorage.setItem(persistedKey, JSON.stringify(parsed));
            }
          }
        } catch (fallbackErr) {
          console.error(
            "[ControlPanels] Emergency fallback failed:",
            fallbackErr
          );
        }

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
    track(SETTINGS_ANALYTICS.RESET, {
      appId: "control-panels",
      action: "format_file_system",
    });
    // Reset wallpaper to default before formatting
    setCurrentWallpaper(DEFAULT_WALLPAPER_PATH);
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
    syncTv,
    syncStickies,
    syncCalendar,
    syncContacts,
    syncMaps,
    setSyncFiles: (enabled: boolean) =>
      setDomainEnabled("files-metadata", enabled),
    setSyncSettings: (enabled: boolean) =>
      setDomainEnabled("settings", enabled),
    setSyncSongs: (enabled: boolean) => setDomainEnabled("songs", enabled),
    setSyncVideos: (enabled: boolean) => setDomainEnabled("videos", enabled),
    setSyncTv: (enabled: boolean) => setDomainEnabled("tv", enabled),
    setSyncStickies: (enabled: boolean) =>
      setDomainEnabled("stickies", enabled),
    setSyncCalendar: (enabled: boolean) =>
      setDomainEnabled("calendar", enabled),
    setSyncContacts: (enabled: boolean) =>
      setDomainEnabled("contacts", enabled),
    setSyncMaps: (enabled: boolean) => setDomainEnabled("maps", enabled),
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
