import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useDockStore } from "@/stores/useDockStore";
import { useDashboardStore } from "@/stores/useDashboardStore";
import { useStickiesStore } from "@/stores/useStickiesStore";
import { areRomanizationSettingsEqual } from "@/types/lyrics";

import { useCalendarStore } from "@/stores/useCalendarStore";
import { useContactsStore } from "@/stores/useContactsStore";
import {
  getPusherClient,
  getRealtimeConnectionState,
  subscribePusherChannel,
  unsubscribePusherChannel,
} from "@/lib/pusherClient";
import {
  subscribeToCloudSyncDomainChanges,
  subscribeToCloudSyncCheckRequests,
} from "@/utils/cloudSyncEvents";
import {
  getPersistedLocalChangeAt,
  setPersistedLocalChangeAt,
} from "@/utils/cloudSyncLocalChangeState";
import {
  downloadAndApplyCloudSyncDomain,
  fetchCloudSyncMetadata,
  getSyncSessionId,
  individualBlobDomainNeedsLocalReconcile,
  uploadCloudSyncDomain,
} from "@/utils/cloudSync";
import {
  getLatestSettingsSectionTimestamp,
  isApplyingRemoteSettingsSection,
  markSettingsSectionChanged,
} from "@/utils/cloudSyncSettingsState";
import {
  CLOUD_SYNC_DOMAINS,
  CLOUD_SYNC_REMOTE_APPLY_DOMAINS,
  getLatestCloudSyncTimestamp,
  getSyncChannelName,
  hasUnsyncedLocalChanges,
  isCloudSyncDomain,
  isIndividualBlobSyncDomain,
  parseCloudSyncTimestamp,
  shouldApplyRemoteUpdate,
  shouldDelaySettingsUploadForWallpaperSync,
  shouldRecheckRemoteAfterLocalSync,
  type CloudSyncDomain,
} from "@/utils/cloudSyncShared";
import type { CloudSyncVersionState } from "@/utils/cloudSyncVersion";

const POLL_INTERVAL_CONNECTED_MS = 10 * 60 * 1000;
const POLL_INTERVAL_DISCONNECTED_MS = 2 * 60 * 1000;

const VISIBILITY_CHECK_COOLDOWN_MS = 30_000;
const REMOTE_APPLY_SUPPRESSION_MS = 2000;

// Safety windows used while a download is in-flight. These are narrowed to
// REMOTE_APPLY_SUPPRESSION_MS once the download completes successfully, so
// they only need to cover the worst-case download duration.
const REALTIME_INFLIGHT_SUPPRESSION_MS = 30_000;
const BATCH_INFLIGHT_SUPPRESSION_MS = 60_000;
const SETTINGS_WALLPAPER_SYNC_RETRY_MS = 1_000;
const SETTINGS_WALLPAPER_SYNC_MAX_WAIT_MS = 20_000;

const UPLOAD_DEBOUNCE_MS: Record<CloudSyncDomain, number> = {
  settings: 2500,
  "files-metadata": 8000,
  "files-images": 8000,
  "files-trash": 5000,
  "files-applets": 8000,
  songs: 4000,
  videos: 4000,
  stickies: 3000,
  calendar: 4000,
  contacts: 3000,
  "custom-wallpapers": 8000,
};

const MAX_UPLOAD_DEBOUNCE_MS: Record<CloudSyncDomain, number> = {
  settings: 8_000,
  "files-metadata": 15_000,
  "files-images": 15_000,
  "files-trash": 10_000,
  "files-applets": 15_000,
  songs: 10_000,
  videos: 10_000,
  stickies: 8_000,
  calendar: 10_000,
  contacts: 8_000,
  "custom-wallpapers": 15_000,
};

const UPLOAD_RETRY_DELAYS = [3_000, 8_000, 20_000];

function createDomainStringMap(initialValue: string | null): Record<CloudSyncDomain, string | null> {
  return {
    settings: initialValue,
    "files-metadata": initialValue,
    "files-images": initialValue,
    "files-trash": initialValue,
    "files-applets": initialValue,
    songs: initialValue,
    videos: initialValue,
    stickies: initialValue,
    calendar: initialValue,
    contacts: initialValue,
    "custom-wallpapers": initialValue,
  };
}

function createDomainNumberMap(initialValue: number): Record<CloudSyncDomain, number> {
  return {
    settings: initialValue,
    "files-metadata": initialValue,
    "files-images": initialValue,
    "files-trash": initialValue,
    "files-applets": initialValue,
    songs: initialValue,
    videos: initialValue,
    stickies: initialValue,
    calendar: initialValue,
    contacts: initialValue,
    "custom-wallpapers": initialValue,
  };
}

function createDomainBooleanMap(
  initialValue: boolean
): Record<CloudSyncDomain, boolean> {
  return {
    settings: initialValue,
    "files-metadata": initialValue,
    "files-images": initialValue,
    "files-trash": initialValue,
    "files-applets": initialValue,
    songs: initialValue,
    videos: initialValue,
    stickies: initialValue,
    calendar: initialValue,
    contacts: initialValue,
    "custom-wallpapers": initialValue,
  };
}

function createDomainPendingRemoteUpdateMap(): Record<
  CloudSyncDomain,
  { updatedAt: string; syncVersion?: CloudSyncVersionState | null } | null
> {
  return {
    settings: null,
    "files-metadata": null,
    "files-images": null,
    "files-trash": null,
    "files-applets": null,
    songs: null,
    videos: null,
    stickies: null,
    calendar: null,
    contacts: null,
    "custom-wallpapers": null,
  };
}

function shouldReplacePendingRemoteUpdate(
  current:
    | { updatedAt: string; syncVersion?: CloudSyncVersionState | null }
    | null,
  incoming: { updatedAt: string; syncVersion?: CloudSyncVersionState | null }
): boolean {
  if (!current) {
    return true;
  }

  const currentVersion = current.syncVersion?.serverVersion || 0;
  const incomingVersion = incoming.syncVersion?.serverVersion || 0;

  if (incomingVersion !== currentVersion) {
    return incomingVersion > currentVersion;
  }

  return (
    parseCloudSyncTimestamp(incoming.updatedAt) >=
    parseCloudSyncTimestamp(current.updatedAt)
  );
}

function getPersistedDeletionChangeAt(domain: CloudSyncDomain): string | null {
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  switch (domain) {
    case "settings":
      return getLatestSettingsSectionTimestamp();
    case "calendar":
      return getLatestCloudSyncTimestamp([
        ...Object.values(deletionMarkers.calendarTodoIds),
        ...Object.values(deletionMarkers.calendarEventIds),
        ...Object.values(deletionMarkers.calendarIds),
      ]);
    case "stickies":
      return getLatestCloudSyncTimestamp(
        Object.values(deletionMarkers.stickyNoteIds)
      );
    case "contacts":
      return getLatestCloudSyncTimestamp(
        Object.values(deletionMarkers.contactIds)
      );
    case "files-metadata":
      return getLatestCloudSyncTimestamp(
        Object.values(deletionMarkers.fileMetadataPaths)
      );
    case "custom-wallpapers":
      return getLatestCloudSyncTimestamp(
        Object.values(deletionMarkers.customWallpaperKeys)
      );
    default:
      return null;
  }
}

function getLatestLocalChangeAt(domain: CloudSyncDomain): string | null {
  return getLatestCloudSyncTimestamp([
    getPersistedLocalChangeAt(domain),
    getPersistedDeletionChangeAt(domain),
  ]);
}

export function useAutoCloudSync() {
  const username = useChatsStore((state) => state.username);
  const isAuthenticated = useChatsStore((state) => state.isAuthenticated);
  const autoSyncEnabled = useCloudSyncStore((state) => state.autoSyncEnabled);
  const syncFiles = useCloudSyncStore((state) => state.syncFiles);
  const syncSettings = useCloudSyncStore((state) => state.syncSettings);
  const syncSongs = useCloudSyncStore((state) => state.syncSongs);
  const syncVideos = useCloudSyncStore((state) => state.syncVideos);
  const syncStickies = useCloudSyncStore((state) => state.syncStickies);
  const syncCalendar = useCloudSyncStore((state) => state.syncCalendar);
  const syncContacts = useCloudSyncStore((state) => state.syncContacts);

  const uploadTimersRef = useRef<
    Partial<Record<CloudSyncDomain, ReturnType<typeof setTimeout>>>
  >({});
  const lastLocalChangeAtRef = useRef<Record<CloudSyncDomain, string | null>>(
    createDomainStringMap(null)
  );
  const remoteApplySuppressUntilRef = useRef<Record<CloudSyncDomain, number>>({
    settings: 0,
    "files-metadata": 0,
    "files-images": 0,
    "files-trash": 0,
    "files-applets": 0,
    songs: 0,
    videos: 0,
    stickies: 0,
    calendar: 0,
    contacts: 0,
    "custom-wallpapers": 0,
  });
  const firstQueuedAtRef = useRef<Record<CloudSyncDomain, number>>(
    createDomainNumberMap(0)
  );
  const uploadRetryCountRef = useRef<Record<CloudSyncDomain, number>>(
    createDomainNumberMap(0)
  );
  const pendingRemoteCatchUpRef = useRef<
    Record<
      CloudSyncDomain,
      { updatedAt: string; syncVersion?: CloudSyncVersionState | null } | null
    >
  >(createDomainPendingRemoteUpdateMap());
  const pendingRealtimeUpdateRef = useRef<
    Record<
      CloudSyncDomain,
      { updatedAt: string; syncVersion?: CloudSyncVersionState | null } | null
    >
  >(createDomainPendingRemoteUpdateMap());
  const uploadInFlightRef = useRef<Record<CloudSyncDomain, boolean>>(
    createDomainBooleanMap(false)
  );
  const pendingUploadAfterCurrentRef = useRef<Record<CloudSyncDomain, boolean>>(
    createDomainBooleanMap(false)
  );
  const checkInFlightRef = useRef(false);
  const pendingRemoteCheckRef = useRef(false);
  const lastVisibilityCheckRef = useRef(0);
  const wallpaperSeedDoneRef = useRef(false);
  const contactsSeedDoneRef = useRef(false);

  const isSyncActive = Boolean(username && isAuthenticated && autoSyncEnabled);

  const enabledDomainsKey = useMemo(
    () =>
      [
        syncSettings ? "1" : "0",
        syncFiles ? "1" : "0",
        syncSongs ? "1" : "0",
        syncVideos ? "1" : "0",
        syncStickies ? "1" : "0",
        syncCalendar ? "1" : "0",
        syncContacts ? "1" : "0",
      ].join(""),
    [
      syncCalendar,
      syncContacts,
      syncFiles,
      syncSettings,
      syncSongs,
      syncStickies,
      syncVideos,
    ]
  );

  const clearUploadTimer = useCallback((domain: CloudSyncDomain) => {
    const timer = uploadTimersRef.current[domain];
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    delete uploadTimersRef.current[domain];
  }, []);

  const clearAllUploadTimers = useCallback(() => {
    for (const domain of CLOUD_SYNC_DOMAINS) {
      clearUploadTimer(domain);
    }
  }, [clearUploadTimer]);

  const isDomainEnabled = useCallback((domain: CloudSyncDomain): boolean => {
    const syncState = useCloudSyncStore.getState();
    return syncState.autoSyncEnabled && syncState.isDomainEnabled(domain);
  }, []);

  const uploadDomain = useCallback(
    async (domain: CloudSyncDomain) => {
      clearUploadTimer(domain);

      if (uploadInFlightRef.current[domain]) {
        if (!firstQueuedAtRef.current[domain]) {
          firstQueuedAtRef.current[domain] = Date.now();
        }
        pendingUploadAfterCurrentRef.current[domain] = true;
        console.log(
          `[CloudSync] Upload ${domain} already in flight — coalescing follow-up sync`
        );
        return;
      }

      if (!username || !isAuthenticated || !isDomainEnabled(domain)) {
        firstQueuedAtRef.current[domain] = 0;
        pendingUploadAfterCurrentRef.current[domain] = false;
        return;
      }

      const syncState = useCloudSyncStore.getState();

      if (domain === "settings") {
        const now = Date.now();
        const queuedAt = firstQueuedAtRef.current.settings || now;
        if (!firstQueuedAtRef.current.settings) {
          firstQueuedAtRef.current.settings = queuedAt;
        }

        const customWallpaperStatus = syncState.domainStatus["custom-wallpapers"];
        const customWallpapersLastLocalChangeAt =
          getLatestLocalChangeAt("custom-wallpapers") ||
          lastLocalChangeAtRef.current["custom-wallpapers"];
        const shouldDelayForWallpaperSync =
          shouldDelaySettingsUploadForWallpaperSync({
            currentWallpaper: useDisplaySettingsStore.getState().currentWallpaper,
            customWallpapersEnabled: isDomainEnabled("custom-wallpapers"),
            customWallpapersLastLocalChangeAt,
            customWallpapersLastUploadedAt:
              customWallpaperStatus.lastUploadedAt,
            customWallpapersHasPendingUpload:
              Boolean(uploadTimersRef.current["custom-wallpapers"]) ||
              customWallpaperStatus.isUploading,
            settingsQueuedAtMs: queuedAt,
            nowMs: now,
            maxWaitMs: SETTINGS_WALLPAPER_SYNC_MAX_WAIT_MS,
          });

        if (shouldDelayForWallpaperSync) {
          console.log(
            "[CloudSync] Delaying settings upload until custom-wallpapers syncs the active wallpaper"
          );
          uploadTimersRef.current[domain] = setTimeout(() => {
            void uploadDomain(domain);
          }, SETTINGS_WALLPAPER_SYNC_RETRY_MS);
          return;
        }
      }

      firstQueuedAtRef.current[domain] = 0;
      pendingUploadAfterCurrentRef.current[domain] = false;
      uploadInFlightRef.current[domain] = true;
      syncState.markUploadStart(domain);
      let uploadSucceeded = false;

      try {
        console.log(`[CloudSync] Uploading ${domain}...`);
        const metadata = await uploadCloudSyncDomain(domain, {
          username,
          isAuthenticated,
        });

        console.log(`[CloudSync] Upload ${domain} succeeded`, metadata.updatedAt);
        syncState.markUploadSuccess(domain, metadata);
        syncState.updateRemoteMetadataForDomain(domain, metadata);
        uploadRetryCountRef.current[domain] = 0;

        const currentLastChange = lastLocalChangeAtRef.current[domain];
        if (
          parseCloudSyncTimestamp(currentLastChange) <=
          parseCloudSyncTimestamp(metadata.updatedAt)
        ) {
          lastLocalChangeAtRef.current[domain] = metadata.updatedAt;
          setPersistedLocalChangeAt(domain, metadata.updatedAt);
        }
        uploadSucceeded = true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Failed to sync ${domain}.`;
        console.error(`[CloudSync] Upload ${domain} FAILED:`, message, error);
        useCloudSyncStore.getState().markUploadFailure(domain, message);

        const retryCount = uploadRetryCountRef.current[domain] || 0;
        if (retryCount < UPLOAD_RETRY_DELAYS.length) {
          const retryDelay = UPLOAD_RETRY_DELAYS[retryCount];
          uploadRetryCountRef.current[domain] = retryCount + 1;
          console.log(`[CloudSync] Scheduling retry #${retryCount + 1} for ${domain} in ${retryDelay}ms`);
          uploadTimersRef.current[domain] = setTimeout(() => {
            void uploadDomain(domain);
          }, retryDelay);
        }
      } finally {
        uploadInFlightRef.current[domain] = false;

        if (
          pendingUploadAfterCurrentRef.current[domain] &&
          username &&
          isAuthenticated &&
          isDomainEnabled(domain)
        ) {
          pendingUploadAfterCurrentRef.current[domain] = false;
          console.log(
            `[CloudSync] Re-running coalesced upload for ${domain}`
          );
          void uploadDomain(domain);
        } else {
          pendingUploadAfterCurrentRef.current[domain] = false;
          const pendingRemoteUpdate = pendingRemoteCatchUpRef.current[domain];
          if (uploadSucceeded && pendingRemoteUpdate) {
            pendingRemoteCatchUpRef.current[domain] = null;
            console.log(
              `[CloudSync] Rechecking deferred remote update for ${domain}`
            );
            void handleRealtimeDomainUpdateRef.current(
              domain,
              pendingRemoteUpdate.updatedAt,
              pendingRemoteUpdate.syncVersion
            );
          }
        }
      }
    },
    [isAuthenticated, clearUploadTimer, isDomainEnabled, username]
  );

  const queueUpload = useCallback(
    (domain: CloudSyncDomain) => {
      if (!isSyncActive || !isDomainEnabled(domain)) {
        console.log(`[CloudSync] queueUpload(${domain}) skipped: syncActive=${isSyncActive}, enabled=${isDomainEnabled(domain)}`);
        return;
      }

      const now = Date.now();
      const timestamp = new Date(now).toISOString();
      lastLocalChangeAtRef.current[domain] = timestamp;
      setPersistedLocalChangeAt(domain, timestamp);
      uploadRetryCountRef.current[domain] = 0;

      if (!firstQueuedAtRef.current[domain]) {
        firstQueuedAtRef.current[domain] = now;
      }

      const syncState = useCloudSyncStore.getState();
      if (
        uploadInFlightRef.current[domain] ||
        syncState.domainStatus[domain].isUploading
      ) {
        pendingUploadAfterCurrentRef.current[domain] = true;
        clearUploadTimer(domain);
        console.log(
          `[CloudSync] queueUpload(${domain}) deferred: upload already in flight`
        );
        return;
      }

      const suppressUntil = remoteApplySuppressUntilRef.current[domain];
      if (now < suppressUntil) {
        const remainingMs = suppressUntil - now;
        const deferMs = remainingMs + UPLOAD_DEBOUNCE_MS[domain];
        console.log(`[CloudSync] queueUpload(${domain}) deferred: suppressed for ${remainingMs}ms, will fire in ${deferMs}ms`);
        clearUploadTimer(domain);
        uploadTimersRef.current[domain] = setTimeout(() => {
          void uploadDomain(domain);
        }, deferMs);
        return;
      }

      const maxDebounce = MAX_UPLOAD_DEBOUNCE_MS[domain];
      const elapsed = now - firstQueuedAtRef.current[domain];

      clearUploadTimer(domain);

      if (elapsed >= maxDebounce) {
        console.log(`[CloudSync] queueUpload(${domain}) — max debounce reached (${elapsed}ms), uploading now`);
        void uploadDomain(domain);
      } else {
        const remainingMax = maxDebounce - elapsed;
        const delay = Math.min(UPLOAD_DEBOUNCE_MS[domain], remainingMax);
        console.log(`[CloudSync] queueUpload(${domain}) — debounce ${delay}ms (cap in ${remainingMax}ms)`);
        uploadTimersRef.current[domain] = setTimeout(() => {
          void uploadDomain(domain);
        }, delay);
      }
    },
    [clearUploadTimer, isDomainEnabled, isSyncActive, uploadDomain]
  );

  const syncChannelRef = useRef<{ name: string; unbind: () => void } | null>(
    null
  );
  const realtimeInFlightRef = useRef(new Set<CloudSyncDomain>());

  const handleRealtimeDomainUpdate = useCallback(
    async (
      domain: CloudSyncDomain,
      remoteUpdatedAt: string,
      remoteSyncVersion?: CloudSyncVersionState | null
    ) => {
      if (!username || !isAuthenticated || !isDomainEnabled(domain)) return;
      if (realtimeInFlightRef.current.has(domain)) {
        const pendingUpdate = {
          updatedAt: remoteUpdatedAt,
          syncVersion: remoteSyncVersion,
        };
        if (
          shouldReplacePendingRemoteUpdate(
            pendingRealtimeUpdateRef.current[domain],
            pendingUpdate
          )
        ) {
          pendingRealtimeUpdateRef.current[domain] = pendingUpdate;
        }
        return;
      }

      const syncState = useCloudSyncStore.getState();
      const domainStatus = syncState.domainStatus[domain];

      const hasUnsynced = hasUnsyncedLocalChanges(
        lastLocalChangeAtRef.current[domain],
        domainStatus.lastUploadedAt,
        Boolean(uploadTimersRef.current[domain]) || domainStatus.isUploading
      );
      const shouldApplyMetadata = shouldApplyRemoteUpdate({
        remoteUpdatedAt,
        remoteSyncVersion: remoteSyncVersion || syncState.remoteMetadata[domain]?.syncVersion,
        lastAppliedRemoteAt: domainStatus.lastAppliedRemoteAt,
        lastUploadedAt: domainStatus.lastUploadedAt,
        lastLocalChangeAt: lastLocalChangeAtRef.current[domain],
        hasPendingUpload:
          Boolean(uploadTimersRef.current[domain]) || domainStatus.isUploading,
        lastKnownServerVersion: domainStatus.lastKnownServerVersion,
      });
      if (
        !shouldApplyMetadata &&
        shouldRecheckRemoteAfterLocalSync({
          remoteUpdatedAt,
          remoteSyncVersion:
            remoteSyncVersion || syncState.remoteMetadata[domain]?.syncVersion,
          lastAppliedRemoteAt: domainStatus.lastAppliedRemoteAt,
          lastUploadedAt: domainStatus.lastUploadedAt,
          lastLocalChangeAt: lastLocalChangeAtRef.current[domain],
          hasPendingUpload:
            Boolean(uploadTimersRef.current[domain]) || domainStatus.isUploading,
          lastKnownServerVersion: domainStatus.lastKnownServerVersion,
        })
      ) {
        pendingRemoteCatchUpRef.current[domain] = {
          updatedAt: remoteUpdatedAt,
          syncVersion:
            remoteSyncVersion || syncState.remoteMetadata[domain]?.syncVersion,
        };
      }
      let reconcileIndividualBlobs = false;
      if (
        !shouldApplyMetadata &&
        !hasUnsynced &&
        isIndividualBlobSyncDomain(domain)
      ) {
        reconcileIndividualBlobs = await individualBlobDomainNeedsLocalReconcile(
          domain,
          { username, isAuthenticated }
        );
      }
      if (!shouldApplyMetadata && !reconcileIndividualBlobs) return;

      remoteApplySuppressUntilRef.current[domain] = Date.now() + REALTIME_INFLIGHT_SUPPRESSION_MS;
      realtimeInFlightRef.current.add(domain);

      try {
        console.log(
          reconcileIndividualBlobs
            ? `[CloudSync] Realtime reconcile individual blobs: ${domain}`
            : `[CloudSync] Realtime download: ${domain}`
        );
        const downloadResult = await downloadAndApplyCloudSyncDomain(domain, {
          username,
          isAuthenticated,
        }, {
          shouldApply: (metadata) => {
            if (reconcileIndividualBlobs) return true;
            const latestLocalChangeAt =
              getLatestLocalChangeAt(domain) || lastLocalChangeAtRef.current[domain];
            const currentSyncState = useCloudSyncStore.getState();
            const currentDomainStatus = currentSyncState.domainStatus[domain];

            return shouldApplyRemoteUpdate({
              remoteUpdatedAt: metadata.updatedAt,
              remoteSyncVersion: metadata.syncVersion,
              lastAppliedRemoteAt: currentDomainStatus.lastAppliedRemoteAt,
              lastUploadedAt: currentDomainStatus.lastUploadedAt,
              lastLocalChangeAt: latestLocalChangeAt,
              hasPendingUpload:
                Boolean(uploadTimersRef.current[domain]) ||
                currentDomainStatus.isUploading,
              lastKnownServerVersion: currentDomainStatus.lastKnownServerVersion,
            });
          },
        });
        useCloudSyncStore
          .getState()
          .updateRemoteMetadataForDomain(domain, downloadResult.metadata);

        if (downloadResult.applied) {
          useCloudSyncStore
            .getState()
            .markRemoteApplied(domain, downloadResult.metadata);
          lastLocalChangeAtRef.current[domain] = getLatestLocalChangeAt(domain);
          remoteApplySuppressUntilRef.current[domain] =
            Date.now() + REMOTE_APPLY_SUPPRESSION_MS;
        } else {
          remoteApplySuppressUntilRef.current[domain] = 0;
        }
      } catch (error) {
        console.error(`[CloudSync] Targeted download ${domain} failed:`, error);
        remoteApplySuppressUntilRef.current[domain] = 0;
      } finally {
        realtimeInFlightRef.current.delete(domain);
        const pendingUpdate = pendingRealtimeUpdateRef.current[domain];
        if (pendingUpdate) {
          pendingRealtimeUpdateRef.current[domain] = null;
          void handleRealtimeDomainUpdateRef.current(
            domain,
            pendingUpdate.updatedAt,
            pendingUpdate.syncVersion
          );
        }
      }
    },
    [isAuthenticated, isDomainEnabled, username]
  );

  const checkRemoteUpdates = useCallback(async () => {
    if (!username || !isAuthenticated || !isSyncActive) {
      return;
    }

    if (checkInFlightRef.current) {
      pendingRemoteCheckRef.current = true;
      return;
    }

    checkInFlightRef.current = true;
    useCloudSyncStore.getState().setCheckingRemote(true);

    try {
      const metadataMap = await fetchCloudSyncMetadata({ username, isAuthenticated });
      useCloudSyncStore.getState().setRemoteMetadata(metadataMap);
      useCloudSyncStore.getState().setLastError(null);

      // Pre-suppress ALL domains before applying any. Applying one domain
      // can trigger side-effect uploads on another (e.g. settings apply
      // changes currentWallpaper → subscriber queues custom-wallpapers
      // upload while IndexedDB is still empty). A generous window ensures
      // the entire batch completes before any upload can fire.
      const batchSuppressUntil = Date.now() + BATCH_INFLIGHT_SUPPRESSION_MS;
      for (const d of CLOUD_SYNC_DOMAINS) {
        remoteApplySuppressUntilRef.current[d] = batchSuppressUntil;
      }

      const appliedDomains: CloudSyncDomain[] = [];

      for (const domain of CLOUD_SYNC_REMOTE_APPLY_DOMAINS) {
        if (!isDomainEnabled(domain)) {
          continue;
        }

        const remoteMetadata = metadataMap[domain];
        const syncState = useCloudSyncStore.getState();
        const domainStatus = syncState.domainStatus[domain];

        if (!remoteMetadata) {
          continue;
        }

        const hasUnsynced = hasUnsyncedLocalChanges(
          lastLocalChangeAtRef.current[domain],
          domainStatus.lastUploadedAt,
          Boolean(uploadTimersRef.current[domain]) || domainStatus.isUploading
        );
        const shouldApplyMetadata = shouldApplyRemoteUpdate({
          remoteUpdatedAt: remoteMetadata.updatedAt,
          remoteSyncVersion: remoteMetadata.syncVersion,
          lastAppliedRemoteAt: domainStatus.lastAppliedRemoteAt,
          lastUploadedAt: domainStatus.lastUploadedAt,
          lastLocalChangeAt: lastLocalChangeAtRef.current[domain],
          hasPendingUpload:
            Boolean(uploadTimersRef.current[domain]) || domainStatus.isUploading,
          lastKnownServerVersion: domainStatus.lastKnownServerVersion,
        });
        if (
          !shouldApplyMetadata &&
          shouldRecheckRemoteAfterLocalSync({
            remoteUpdatedAt: remoteMetadata.updatedAt,
            remoteSyncVersion: remoteMetadata.syncVersion,
            lastAppliedRemoteAt: domainStatus.lastAppliedRemoteAt,
            lastUploadedAt: domainStatus.lastUploadedAt,
            lastLocalChangeAt: lastLocalChangeAtRef.current[domain],
            hasPendingUpload:
              Boolean(uploadTimersRef.current[domain]) || domainStatus.isUploading,
            lastKnownServerVersion: domainStatus.lastKnownServerVersion,
          })
        ) {
          pendingRemoteCatchUpRef.current[domain] = {
            updatedAt: remoteMetadata.updatedAt,
            syncVersion: remoteMetadata.syncVersion,
          };
        }
        let reconcileIndividualBlobs = false;
        if (
          !shouldApplyMetadata &&
          !hasUnsynced &&
          isIndividualBlobSyncDomain(domain)
        ) {
          reconcileIndividualBlobs =
            await individualBlobDomainNeedsLocalReconcile(domain, {
              username,
              isAuthenticated,
            });
        }
        if (!shouldApplyMetadata && !reconcileIndividualBlobs) {
          continue;
        }

        const downloadResult = await downloadAndApplyCloudSyncDomain(domain, {
          username,
          isAuthenticated,
        }, {
          shouldApply: (metadata) => {
            if (reconcileIndividualBlobs) return true;
            const latestLocalChangeAt =
              getLatestLocalChangeAt(domain) || lastLocalChangeAtRef.current[domain];
            const currentSyncState = useCloudSyncStore.getState();
            const currentDomainStatus = currentSyncState.domainStatus[domain];

            return shouldApplyRemoteUpdate({
              remoteUpdatedAt: metadata.updatedAt,
              remoteSyncVersion: metadata.syncVersion,
              lastAppliedRemoteAt: currentDomainStatus.lastAppliedRemoteAt,
              lastUploadedAt: currentDomainStatus.lastUploadedAt,
              lastLocalChangeAt: latestLocalChangeAt,
              hasPendingUpload:
                Boolean(uploadTimersRef.current[domain]) ||
                currentDomainStatus.isUploading,
              lastKnownServerVersion: currentDomainStatus.lastKnownServerVersion,
            });
          },
        });
        useCloudSyncStore
          .getState()
          .updateRemoteMetadataForDomain(domain, downloadResult.metadata);

        if (downloadResult.applied) {
          useCloudSyncStore
            .getState()
            .markRemoteApplied(domain, downloadResult.metadata);
          lastLocalChangeAtRef.current[domain] = getLatestLocalChangeAt(domain);
          appliedDomains.push(domain);
        }
      }

      // Narrow suppression: applied domains get a short post-apply window,
      // all others are released immediately.
      const postApplyUntil = Date.now() + REMOTE_APPLY_SUPPRESSION_MS;
      for (const d of CLOUD_SYNC_DOMAINS) {
        remoteApplySuppressUntilRef.current[d] = appliedDomains.includes(d)
          ? postApplyUntil
          : 0;
      }

      // One-time seed: if the cloud has no custom-wallpapers but local does,
      // queue an upload after the suppression window so the first device
      // populates the cloud. Runs only once per session.
      if (!wallpaperSeedDoneRef.current && isDomainEnabled("custom-wallpapers")) {
        wallpaperSeedDoneRef.current = true;
        if (!metadataMap["custom-wallpapers"]?.updatedAt) {
          const localRefs = await useDisplaySettingsStore
            .getState()
            .loadCustomWallpapers();
          if (localRefs.length > 0) {
            console.log(`[CloudSync] Seed upload: ${localRefs.length} local custom wallpapers, no remote data`);
            setTimeout(
              () => queueUpload("custom-wallpapers"),
              REMOTE_APPLY_SUPPRESSION_MS + 1000
            );
          }
        }
      }

      if (!contactsSeedDoneRef.current && isDomainEnabled("contacts")) {
        contactsSeedDoneRef.current = true;
        if (!metadataMap["contacts"]?.updatedAt) {
          const localContacts = useContactsStore.getState().contacts;
          if (localContacts.length > 0) {
            console.log(`[CloudSync] Seed upload: ${localContacts.length} local contacts, no remote data`);
            setTimeout(
              () => queueUpload("contacts"),
              REMOTE_APPLY_SUPPRESSION_MS + 1000
            );
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to check cloud sync.";
      useCloudSyncStore.getState().setLastError(message);
    } finally {
      useCloudSyncStore.getState().setCheckingRemote(false);
      checkInFlightRef.current = false;
      if (pendingRemoteCheckRef.current) {
        pendingRemoteCheckRef.current = false;
        void checkRemoteUpdates();
      }
    }
  }, [isAuthenticated, isDomainEnabled, isSyncActive, queueUpload, username]);

  const handleRealtimeDomainUpdateRef = useRef(handleRealtimeDomainUpdate);
  handleRealtimeDomainUpdateRef.current = handleRealtimeDomainUpdate;

  useEffect(() => {
    if (!isSyncActive || !username) {
      if (syncChannelRef.current) {
        syncChannelRef.current.unbind();
        unsubscribePusherChannel(syncChannelRef.current.name);
        syncChannelRef.current = null;
      }
      return;
    }

    const channelName = getSyncChannelName(username);
    const sessionId = getSyncSessionId();
    const channel = subscribePusherChannel(channelName);

    const handler = (data: unknown) => {
      const payload = data as {
        domain?: string;
        updatedAt?: string;
        sourceSessionId?: string;
        syncVersion?: CloudSyncVersionState | null;
      };

      if (payload.sourceSessionId === sessionId) return;

      if (
        !payload.domain ||
        !payload.updatedAt ||
        !isCloudSyncDomain(payload.domain)
      ) {
        console.warn("[CloudSync] Ignoring malformed realtime payload:", payload);
        return;
      }

      void handleRealtimeDomainUpdateRef.current(
        payload.domain,
        payload.updatedAt,
        payload.syncVersion
      );
    };

    channel.bind("domain-updated", handler);
    syncChannelRef.current = {
      name: channelName,
      unbind: () => {
        channel.unbind("domain-updated", handler);
      },
    };

    return () => {
      if (syncChannelRef.current) {
        syncChannelRef.current.unbind();
        unsubscribePusherChannel(syncChannelRef.current.name);
        syncChannelRef.current = null;
      }
    };
  }, [isSyncActive, username]);

  const flushPendingUploads = useCallback(() => {
    const syncState = useCloudSyncStore.getState();
    for (const domain of CLOUD_SYNC_DOMAINS) {
      if (!isDomainEnabled(domain)) continue;

      const domainStatus = syncState.domainStatus[domain];
      const localChangeTs = parseCloudSyncTimestamp(
        lastLocalChangeAtRef.current[domain]
      );

      if (localChangeTs === 0) continue;

      const lastSyncedTs = Math.max(
        parseCloudSyncTimestamp(domainStatus.lastUploadedAt),
        parseCloudSyncTimestamp(domainStatus.lastAppliedRemoteAt)
      );

      if (localChangeTs > lastSyncedTs) {
        setTimeout(
          () => queueUpload(domain),
          REMOTE_APPLY_SUPPRESSION_MS + 1000
        );
      }
    }
  }, [isDomainEnabled, queueUpload]);

  // Trigger a bidirectional sync when the user switches back to this tab,
  // focuses the window, or comes back online — pull remote changes and push
  // any pending local changes so other clients see them.
  useEffect(() => {
    if (!isSyncActive) return;

    const triggerCheck = () => {
      const now = Date.now();
      if (now - lastVisibilityCheckRef.current < VISIBILITY_CHECK_COOLDOWN_MS) {
        return;
      }
      lastVisibilityCheckRef.current = now;
      console.log("[CloudSync] Triggered bidirectional sync (visibility/focus/online)");
      void checkRemoteUpdates().then(flushPendingUploads);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerCheck();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", triggerCheck);
    window.addEventListener("online", triggerCheck);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", triggerCheck);
      window.removeEventListener("online", triggerCheck);
    };
  }, [checkRemoteUpdates, flushPendingUploads, isSyncActive]);

  useEffect(() => {
    if (!isSyncActive) {
      clearAllUploadTimers();
      return;
    }

    const filesUnsubscribe = useFilesStore.subscribe((state, prevState) => {
      if (
        state.items !== prevState.items ||
        state.libraryState !== prevState.libraryState
      ) {
        queueUpload("files-metadata");
      }
    });

    const syncEventsUnsubscribe = subscribeToCloudSyncDomainChanges((domain) => {
      console.log(`[CloudSync] Domain change event received: ${domain}`);
      queueUpload(domain);
    });

    const syncCheckUnsubscribe = subscribeToCloudSyncCheckRequests(() => {
      void checkRemoteUpdates();
    });

    const themeUnsubscribe = useThemeStore.subscribe((state, prevState) => {
      if (state.current !== prevState.current) {
        if (isApplyingRemoteSettingsSection("theme")) return;
        markSettingsSectionChanged("theme");
        queueUpload("settings");
      }
    });

    const languageUnsubscribe = useLanguageStore.subscribe((state, prevState) => {
      if (state.current !== prevState.current) {
        if (isApplyingRemoteSettingsSection("language")) return;
        markSettingsSectionChanged("language");
        queueUpload("settings");
      }
    });

    const displayUnsubscribe = useDisplaySettingsStore.subscribe(
      (state, prevState) => {
        if (
          state.displayMode !== prevState.displayMode ||
          state.shaderEffectEnabled !== prevState.shaderEffectEnabled ||
          state.selectedShaderType !== prevState.selectedShaderType ||
          state.currentWallpaper !== prevState.currentWallpaper ||
          state.screenSaverEnabled !== prevState.screenSaverEnabled ||
          state.screenSaverType !== prevState.screenSaverType ||
          state.screenSaverIdleTime !== prevState.screenSaverIdleTime ||
          state.debugMode !== prevState.debugMode ||
          state.htmlPreviewSplit !== prevState.htmlPreviewSplit
        ) {
          if (isApplyingRemoteSettingsSection("display")) return;
          markSettingsSectionChanged("display");
          queueUpload("settings");
        }
        if (
          state.currentWallpaper !== prevState.currentWallpaper &&
          state.currentWallpaper.startsWith("indexeddb://")
        ) {
          if (isApplyingRemoteSettingsSection("display")) return;
          console.log(`[CloudSync] display subscriber: currentWallpaper changed from "${prevState.currentWallpaper}" to "${state.currentWallpaper}"`);
          queueUpload("custom-wallpapers");
        }
      }
    );

    const audioUnsubscribe = useAudioSettingsStore.subscribe(
      (state, prevState) => {
        if (
          state.masterVolume !== prevState.masterVolume ||
          state.uiVolume !== prevState.uiVolume ||
          state.chatSynthVolume !== prevState.chatSynthVolume ||
          state.speechVolume !== prevState.speechVolume ||
          state.ipodVolume !== prevState.ipodVolume ||
          state.uiSoundsEnabled !== prevState.uiSoundsEnabled ||
          state.terminalSoundsEnabled !== prevState.terminalSoundsEnabled ||
          state.typingSynthEnabled !== prevState.typingSynthEnabled ||
          state.speechEnabled !== prevState.speechEnabled ||
          state.keepTalkingEnabled !== prevState.keepTalkingEnabled ||
          state.ttsModel !== prevState.ttsModel ||
          state.ttsVoice !== prevState.ttsVoice ||
          state.synthPreset !== prevState.synthPreset
        ) {
          if (isApplyingRemoteSettingsSection("audio")) return;
          markSettingsSectionChanged("audio");
          queueUpload("settings");
        }
      }
    );

    const appUnsubscribe = useAppStore.subscribe((state, prevState) => {
      if (state.aiModel !== prevState.aiModel) {
        if (isApplyingRemoteSettingsSection("aiModel")) return;
        markSettingsSectionChanged("aiModel");
        queueUpload("settings");
      }
    });

    const ipodSettingsUnsubscribe = useIpodStore.subscribe(
      (state, prevState) => {
        if (
          state.displayMode !== prevState.displayMode ||
          state.showLyrics !== prevState.showLyrics ||
          state.lyricsAlignment !== prevState.lyricsAlignment ||
          state.lyricsFont !== prevState.lyricsFont ||
          !areRomanizationSettingsEqual(
            state.romanization,
            prevState.romanization
          ) ||
          state.lyricsTranslationLanguage !== prevState.lyricsTranslationLanguage ||
          state.theme !== prevState.theme ||
          state.lcdFilterOn !== prevState.lcdFilterOn
        ) {
          if (isApplyingRemoteSettingsSection("ipod")) return;
          markSettingsSectionChanged("ipod");
          queueUpload("settings");
        }
      }
    );

    const songsUnsubscribe = useIpodStore.subscribe((state, prevState) => {
      if (
        state.tracks !== prevState.tracks ||
        state.libraryState !== prevState.libraryState ||
        state.lastKnownVersion !== prevState.lastKnownVersion
      ) {
        if (state.tracks !== prevState.tracks) {
          const currentIds = new Set(state.tracks.map((t) => t.id));
          const prevIds = new Set(prevState.tracks.map((t) => t.id));
          const removedIds = prevState.tracks
            .map((t) => t.id)
            .filter((id) => !currentIds.has(id));
          const addedIds = state.tracks
            .map((t) => t.id)
            .filter((id) => !prevIds.has(id));
          const syncStore = useCloudSyncStore.getState();
          if (removedIds.length > 0) {
            syncStore.markDeletedKeys("songTrackIds", removedIds);
          }
          if (addedIds.length > 0) {
            syncStore.clearDeletedKeys("songTrackIds", addedIds);
          }
        }
        queueUpload("songs");
      }
    });

    const videosUnsubscribe = useVideoStore.subscribe((state, prevState) => {
      if (state.videos !== prevState.videos) {
        queueUpload("videos");
      }
    });

    const dockUnsubscribe = useDockStore.subscribe((state, prevState) => {
      if (
        state.pinnedItems !== prevState.pinnedItems ||
        state.scale !== prevState.scale ||
        state.hiding !== prevState.hiding ||
        state.magnification !== prevState.magnification
      ) {
        if (isApplyingRemoteSettingsSection("dock")) return;
        markSettingsSectionChanged("dock");
        queueUpload("settings");
      }
    });

    const dashboardUnsubscribe = useDashboardStore.subscribe(
      (state, prevState) => {
        if (state.widgets !== prevState.widgets) {
          if (isApplyingRemoteSettingsSection("dashboard")) return;
          markSettingsSectionChanged("dashboard");
          queueUpload("settings");
        }
      }
    );

    const stickiesUnsubscribe = useStickiesStore.subscribe(
      (state, prevState) => {
        if (state.notes !== prevState.notes) {
          queueUpload("stickies");
        }
      }
    );

    const calendarUnsubscribe = useCalendarStore.subscribe((state, prevState) => {
      if (
        state.events !== prevState.events ||
        state.calendars !== prevState.calendars ||
        state.todos !== prevState.todos
      ) {
        queueUpload("calendar");
      }
    });

    const contactsUnsubscribe = useContactsStore.subscribe((state, prevState) => {
      if (state.contacts !== prevState.contacts) {
        queueUpload("contacts");
      }
    });

    // Clear any uploads queued by store hydration/initialization so the
    // first remote check can pull down data without being blocked by
    // "has pending upload" guards (e.g. initializeLibrary on new devices).
    // For domains that had a pending upload timer (genuine local change not
    // yet synced), keep the ref so shouldApplyRemoteUpdate won't overwrite
    // it. For all others, reset from persisted state.
    const hadPendingTimer = new Set<CloudSyncDomain>();
    for (const d of CLOUD_SYNC_DOMAINS) {
      if (uploadTimersRef.current[d]) {
        hadPendingTimer.add(d);
      }
    }
    clearAllUploadTimers();
    for (const d of CLOUD_SYNC_DOMAINS) {
      if (hadPendingTimer.has(d)) {
        const persisted = getLatestLocalChangeAt(d);
        const current = lastLocalChangeAtRef.current[d];
        if (
          persisted &&
          parseCloudSyncTimestamp(persisted) >
            parseCloudSyncTimestamp(current)
        ) {
          lastLocalChangeAtRef.current[d] = persisted;
        }
      } else {
        lastLocalChangeAtRef.current[d] = getLatestLocalChangeAt(d);
      }
    }

    void checkRemoteUpdates().then(flushPendingUploads);

    // Adaptive polling: use a longer interval when realtime connection is up
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      const isConnected = getRealtimeConnectionState() === "connected";
      const pollMs = isConnected ? POLL_INTERVAL_CONNECTED_MS : POLL_INTERVAL_DISCONNECTED_MS;
      intervalId = setInterval(() => {
        void checkRemoteUpdates().then(flushPendingUploads);
      }, pollMs);
    };

    startPolling();

    // Re-sync and adjust poll interval when realtime connection state changes
    const client = getPusherClient();
    const onConnected = () => {
      console.log("[CloudSync] Realtime connected — running catch-up sync");
      void checkRemoteUpdates().then(flushPendingUploads);
      startPolling();
    };
    const onDisconnected = () => {
      startPolling();
    };
    client.connection.bind("connected", onConnected);
    client.connection.bind("disconnected", onDisconnected);

    return () => {
      if (intervalId) clearInterval(intervalId);
      client.connection.unbind("connected", onConnected);
      client.connection.unbind("disconnected", onDisconnected);
      clearAllUploadTimers();
      filesUnsubscribe();
      syncEventsUnsubscribe();
      syncCheckUnsubscribe();
      themeUnsubscribe();
      languageUnsubscribe();
      displayUnsubscribe();
      audioUnsubscribe();
      appUnsubscribe();
      ipodSettingsUnsubscribe();
      songsUnsubscribe();
      videosUnsubscribe();
      dockUnsubscribe();
      dashboardUnsubscribe();
      stickiesUnsubscribe();
      calendarUnsubscribe();
      contactsUnsubscribe();
    };
  }, [
    checkRemoteUpdates,
    clearAllUploadTimers,
    enabledDomainsKey,
    flushPendingUploads,
    isSyncActive,
    queueUpload,
  ]);
}
