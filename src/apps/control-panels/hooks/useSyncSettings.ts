import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { clearAllAppStates } from "@/stores/useAppStore";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
import { useDisplaySettingsStoreShallow } from "@/stores/helpers";
import { setNextBootMessage, clearNextBootMessage } from "@/utils/bootMessage";
import { clearPrefetchFlag } from "@/utils/prefetch";
import { getApiUrl } from "@/utils/platform";
import {
  uploadBlobWithStorageInstruction,
  type StorageUploadInstruction,
} from "@/utils/storageUpload";
import { abortableFetch } from "@/utils/abortableFetch";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  FILE_SYNC_DOMAINS,
  type CloudSyncDomain,
  getLatestCloudSyncTimestamp,
} from "@/utils/cloudSyncShared";
import { useShallow } from "zustand/react/shallow";
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
  BACKUP_INDEXEDDB_STORES,
  CLOUD_BACKUP_MAX_SIZE,
  upgradeLegacyBackupStoreValue,
  readStoreItems,
  restoreStoreItems,
  serializeStoreItems,
  type StoreItemWithKey,
} from "./backupShared";

export interface UseSyncSettingsProps {
  username: string | null | undefined;
  isAuthenticated: boolean;
}

export function useSyncSettings({
  username,
  isAuthenticated,
}: UseSyncSettingsProps) {
  const { t } = useTranslation();

  const { setCurrentWallpaper } = useDisplaySettingsStoreShallow((s) => ({
    setCurrentWallpaper: s.setCurrentWallpaper,
  }));

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

  const [cloudProgress, setCloudProgress] = useState<{
    phase: string;
    percent: number;
  } | null>(null);

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

  useEffect(() => {
    if (username && isAuthenticated) {
      fetchCloudSyncStatus();
    } else {
      setCloudSyncStatus(null);
    }
  }, [username, isAuthenticated, fetchCloudSyncStatus]);

  const handleCloudBackup = useCallback(async () => {
    if (!username || !isAuthenticated) {
      toast.error(t("apps.control-panels.cloudSync.loginRequired"));
      return;
    }

    setIsCloudBackingUp(true);
    setCloudProgress({
      phase: t("apps.control-panels.cloudSync.progress.collecting"),
      percent: 0,
    });

    try {
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

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          backup.localStorage[key] = localStorage.getItem(key);
        }
      }

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.collecting"),
        percent: 10,
      });

      try {
        const db = await ensureIndexedDBInitialized();

        setCloudProgress({
          phase: t("apps.control-panels.cloudSync.progress.serializing"),
          percent: 20,
        });
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

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.compressing"),
        percent: 35,
      });

      const jsonString = JSON.stringify(backup);
      const encoder = new TextEncoder();
      const inputData = encoder.encode(jsonString);

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

      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

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

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.uploading"),
        percent: 50,
      });

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
          (tokenError as { error?: string })?.error ||
            "Failed to get upload token"
        );
      }

      const uploadInstruction =
        (await tokenRes.json()) as StorageUploadInstruction;
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

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.finishing"),
        percent: 92,
      });

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

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.finishing"),
        percent: 98,
      });

      if (metaRes.ok) {
        setCloudProgress({
          phase: t("apps.control-panels.cloudSync.backupSuccess"),
          percent: 100,
        });
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
      setTimeout(() => setCloudProgress(null), 1500);
    }
  }, [username, isAuthenticated, t, fetchCloudSyncStatus]);

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
          ) as Array<
            [CloudSyncDomain, NonNullable<(typeof result.partMetadata)[CloudSyncDomain]>]
          >) {
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
          ) as Array<
            [CloudSyncDomain, NonNullable<(typeof result.partMetadata)[CloudSyncDomain]>]
          >) {
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

  const handleCloudRestore = useCallback(async () => {
    if (!username || !isAuthenticated) {
      toast.error(t("apps.control-panels.cloudSync.loginRequired"));
      return;
    }

    setIsCloudRestoring(true);
    setCloudProgress({
      phase: t("apps.control-panels.cloudSync.progress.downloading"),
      percent: 0,
    });

    try {
      const downloadResult = await new Promise<{ ok: boolean; data: unknown }>(
        (resolve, reject) => {
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
        }
      );

      if (!downloadResult.ok) {
        const errorMsg =
          (downloadResult.data as { error?: string })?.error ||
          t("apps.control-panels.cloudSync.restoreFailed");
        toast.error(errorMsg);
        return;
      }

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.decompressing"),
        percent: 45,
      });

      const result = downloadResult.data as { data: string };
      const base64Data = result.data;

      const binaryStr = atob(base64Data);
      const compressedData = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        compressedData[i] = binaryStr.charCodeAt(i);
      }

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

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.restoring"),
        percent: 55,
      });

      const backup = JSON.parse(jsonString);

      if (!backup || !backup.localStorage || !backup.timestamp) {
        throw new Error("Invalid backup format");
      }

      clearAllAppStates();
      clearPrefetchFlag();

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.restoring"),
        percent: 65,
      });

      Object.entries(backup.localStorage).forEach(([key, value]) => {
        if (value !== null) {
          localStorage.setItem(key, value as string);
        }
      });

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.restoring"),
        percent: 75,
      });

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

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.finishing"),
        percent: 90,
      });

      if (backup.localStorage["ryos:app:settings:wallpaper"]) {
        const wallpaper = backup.localStorage["ryos:app:settings:wallpaper"];
        if (wallpaper) {
          setCurrentWallpaper(wallpaper);
        }
      }

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

      setCloudProgress({
        phase: t("apps.control-panels.cloudSync.progress.finishing"),
        percent: 100,
      });

      setNextBootMessage(t("common.system.restoringSystem"));

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

  return {
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
