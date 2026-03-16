import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
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
  subscribeToCloudSyncDomainCheckRequests,
} from "@/utils/cloudSyncEvents";
import {
  getPersistedLocalChangeAt,
  setPersistedLocalChangeAt,
} from "@/utils/sync/engine/state/syncStateAdapter";
import {
  fetchPhysicalCloudSyncMetadata,
  individualBlobDomainNeedsLocalReconcile,
} from "@/utils/cloudSync";
import { getSyncSessionId } from "@/utils/syncSession";
import {
  downloadAndApplyLogicalCloudSyncDomain,
  uploadLogicalCloudSyncDomain,
} from "@/utils/syncLogicalClient";
import {
  getLogicalCloudSyncDomainForPhysical,
  getLogicalCloudSyncDomainPhysicalParts,
  isLogicalCloudSyncDomainEnabled,
  LOGICAL_CLOUD_SYNC_DOMAINS,
  type LogicalCloudSyncDomain,
} from "@/utils/syncLogicalDomains";
import {
  clearPersistedLogicalDirtyParts,
  getPersistedLogicalDirtyParts,
  markLogicalDirtyPart,
} from "@/utils/syncLogicalDirtyState";
import {
  getLatestSettingsSectionTimestamp,
  isApplyingRemoteSettingsSection,
  markSettingsSectionChanged,
  setCloudSyncLanguageInitialized,
} from "@/utils/sync/engine/state/syncStateAdapter";
import { isApplyingRemoteDomain } from "@/utils/cloudSyncRemoteApplyState";
import {
  CLOUD_SYNC_DOMAINS,
  getLatestCloudSyncTimestamp,
  getSyncChannelName,
  hasUnsyncedLocalChanges,
  isCloudSyncDomain,
  isIndividualBlobSyncDomain,
  parseCloudSyncTimestamp,
  shouldApplyRemoteUpdate,
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

function createLogicalDomainNumberMap(
  initialValue: number
): Record<LogicalCloudSyncDomain, number> {
  return {
    files: initialValue,
    settings: initialValue,
    songs: initialValue,
    videos: initialValue,
    stickies: initialValue,
    calendar: initialValue,
    contacts: initialValue,
  };
}

function createLogicalDomainBooleanMap(
  initialValue: boolean
): Record<LogicalCloudSyncDomain, boolean> {
  return {
    files: initialValue,
    settings: initialValue,
    songs: initialValue,
    videos: initialValue,
    stickies: initialValue,
    calendar: initialValue,
    contacts: initialValue,
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

function createLogicalPendingRemoteUpdateMap(): Record<
  LogicalCloudSyncDomain,
  {
    triggerDomain: CloudSyncDomain;
    updatedAt: string;
    syncVersion?: CloudSyncVersionState | null;
  } | null
> {
  return {
    files: null,
    settings: null,
    songs: null,
    videos: null,
    stickies: null,
    calendar: null,
    contacts: null,
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

function getLatestLogicalLocalChangeAt(
  parts: CloudSyncDomain[],
  lastLocalChangeAtRef: MutableRefObject<Record<CloudSyncDomain, string | null>>
): string | null {
  return getLatestCloudSyncTimestamp(
    parts.map((domain) =>
      getLatestCloudSyncTimestamp([
        getLatestLocalChangeAt(domain),
        lastLocalChangeAtRef.current[domain],
      ])
    )
  );
}

function alignLocalChangeWithRemoteApply(
  domain: CloudSyncDomain,
  timestamp: string,
  lastLocalChangeAtRef: MutableRefObject<Record<CloudSyncDomain, string | null>>
): void {
  lastLocalChangeAtRef.current[domain] = timestamp;
  setPersistedLocalChangeAt(domain, timestamp);
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
    Partial<Record<LogicalCloudSyncDomain, ReturnType<typeof setTimeout>>>
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
  const firstQueuedAtRef = useRef<Record<LogicalCloudSyncDomain, number>>(
    createLogicalDomainNumberMap(0)
  );
  const uploadRetryCountRef = useRef<Record<LogicalCloudSyncDomain, number>>(
    createLogicalDomainNumberMap(0)
  );
  const pendingRemoteCatchUpRef = useRef<
    Record<
      CloudSyncDomain,
      { updatedAt: string; syncVersion?: CloudSyncVersionState | null } | null
    >
  >(createDomainPendingRemoteUpdateMap());
  const pendingRealtimeUpdateRef = useRef<
    Record<
      LogicalCloudSyncDomain,
      {
        triggerDomain: CloudSyncDomain;
        updatedAt: string;
        syncVersion?: CloudSyncVersionState | null;
      } | null
    >
  >(createLogicalPendingRemoteUpdateMap());
  const uploadInFlightRef = useRef<Record<LogicalCloudSyncDomain, boolean>>(
    createLogicalDomainBooleanMap(false)
  );
  const pendingUploadAfterCurrentRef = useRef<Record<LogicalCloudSyncDomain, boolean>>(
    createLogicalDomainBooleanMap(false)
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

  const clearUploadTimer = useCallback((domain: LogicalCloudSyncDomain) => {
    const timer = uploadTimersRef.current[domain];
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    delete uploadTimersRef.current[domain];
  }, []);

  const clearAllUploadTimers = useCallback(() => {
    for (const domain of LOGICAL_CLOUD_SYNC_DOMAINS) {
      clearUploadTimer(domain);
    }
  }, [clearUploadTimer]);

  const isDomainEnabled = useCallback((domain: CloudSyncDomain): boolean => {
    const syncState = useCloudSyncStore.getState();
    return syncState.autoSyncEnabled && syncState.isDomainEnabled(domain);
  }, []);

  const getEnabledPartDomains = useCallback(
    (logicalDomain: LogicalCloudSyncDomain): CloudSyncDomain[] =>
      getLogicalCloudSyncDomainPhysicalParts(logicalDomain).filter((domain) =>
        isDomainEnabled(domain)
      ),
    [isDomainEnabled]
  );

  const hasPendingUploadForDomain = useCallback(
    (domain: CloudSyncDomain): boolean => {
      const logicalDomain = getLogicalCloudSyncDomainForPhysical(domain);
      const syncState = useCloudSyncStore.getState();
      return (
        Boolean(uploadTimersRef.current[logicalDomain]) ||
        uploadInFlightRef.current[logicalDomain] ||
        getEnabledPartDomains(logicalDomain).some(
          (partDomain) => syncState.domainStatus[partDomain].isUploading
        )
      );
    },
    [getEnabledPartDomains]
  );

  const uploadDomain = useCallback(
    async (domain: CloudSyncDomain) => {
      const logicalDomain = getLogicalCloudSyncDomainForPhysical(domain);
      clearUploadTimer(logicalDomain);

      if (uploadInFlightRef.current[logicalDomain]) {
        if (!firstQueuedAtRef.current[logicalDomain]) {
          firstQueuedAtRef.current[logicalDomain] = Date.now();
        }
        pendingUploadAfterCurrentRef.current[logicalDomain] = true;
        console.log(
          `[CloudSync] Upload ${logicalDomain} already in flight — coalescing follow-up sync`
        );
        return;
      }

      const enabledPartDomains = getEnabledPartDomains(logicalDomain);
      if (!username || !isAuthenticated || enabledPartDomains.length === 0) {
        firstQueuedAtRef.current[logicalDomain] = 0;
        pendingUploadAfterCurrentRef.current[logicalDomain] = false;
        return;
      }

      const syncState = useCloudSyncStore.getState();
      firstQueuedAtRef.current[logicalDomain] = 0;
      pendingUploadAfterCurrentRef.current[logicalDomain] = false;
      uploadInFlightRef.current[logicalDomain] = true;
      const dirtyPartDomains = getPersistedLogicalDirtyParts(logicalDomain).filter(
        (partDomain) => enabledPartDomains.includes(partDomain)
      );
      const targetPartDomains =
        dirtyPartDomains.length > 0 ? dirtyPartDomains : enabledPartDomains;

      for (const partDomain of targetPartDomains) {
        syncState.markUploadStart(partDomain);
      }
      let uploadSucceeded = false;

      try {
        console.log(`[CloudSync] Uploading logical domain ${logicalDomain}...`);
        const result = await uploadLogicalCloudSyncDomain(logicalDomain, {
          username,
          isAuthenticated,
        }, targetPartDomains);

        for (const [partDomain, metadata] of Object.entries(
          result.partMetadata
        ) as Array<
          [
            CloudSyncDomain,
            NonNullable<(typeof result.partMetadata)[CloudSyncDomain]>
          ]
        >) {
          console.log(
            `[CloudSync] Upload ${partDomain} succeeded`,
            metadata.updatedAt
          );
          syncState.markUploadSuccess(partDomain, metadata);
          syncState.updateRemoteMetadataForDomain(partDomain, metadata);

          const currentLastChange = lastLocalChangeAtRef.current[partDomain];
          if (
            parseCloudSyncTimestamp(currentLastChange) <=
            parseCloudSyncTimestamp(metadata.updatedAt)
          ) {
            lastLocalChangeAtRef.current[partDomain] = metadata.updatedAt;
            setPersistedLocalChangeAt(partDomain, metadata.updatedAt);
          }
        }

        uploadRetryCountRef.current[logicalDomain] = 0;
        clearPersistedLogicalDirtyParts(logicalDomain, targetPartDomains);
        uploadSucceeded = true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Failed to sync ${logicalDomain}.`;
        console.error(
          `[CloudSync] Upload ${logicalDomain} FAILED:`,
          message,
          error
        );
        for (const partDomain of targetPartDomains) {
          useCloudSyncStore.getState().markUploadFailure(partDomain, message);
        }

        const retryCount = uploadRetryCountRef.current[logicalDomain] || 0;
        if (retryCount < UPLOAD_RETRY_DELAYS.length) {
          const retryDelay = UPLOAD_RETRY_DELAYS[retryCount];
          uploadRetryCountRef.current[logicalDomain] = retryCount + 1;
          console.log(
            `[CloudSync] Scheduling retry #${retryCount + 1} for ${logicalDomain} in ${retryDelay}ms`
          );
          uploadTimersRef.current[logicalDomain] = setTimeout(() => {
            void uploadDomain(domain);
          }, retryDelay);
        }
      } finally {
        uploadInFlightRef.current[logicalDomain] = false;

        if (
          pendingUploadAfterCurrentRef.current[logicalDomain] &&
          username &&
          isAuthenticated &&
          getEnabledPartDomains(logicalDomain).length > 0
        ) {
          pendingUploadAfterCurrentRef.current[logicalDomain] = false;
          console.log(
            `[CloudSync] Re-running coalesced upload for ${logicalDomain}`
          );
          void uploadDomain(domain);
        } else {
          pendingUploadAfterCurrentRef.current[logicalDomain] = false;
          if (uploadSucceeded) {
            for (const partDomain of enabledPartDomains) {
              const pendingRemoteUpdate = pendingRemoteCatchUpRef.current[partDomain];
              if (!pendingRemoteUpdate) {
                continue;
              }
              pendingRemoteCatchUpRef.current[partDomain] = null;
              console.log(
                `[CloudSync] Rechecking deferred remote update for ${partDomain}`
              );
              void handleRealtimeDomainUpdateRef.current(
                partDomain,
                pendingRemoteUpdate.updatedAt,
                pendingRemoteUpdate.syncVersion
              );
            }
          }
        }
      }
    },
    [
      clearUploadTimer,
      getEnabledPartDomains,
      isAuthenticated,
      username,
      uploadLogicalCloudSyncDomain,
    ]
  );

  const queueUpload = useCallback(
    (domain: CloudSyncDomain) => {
      if (!isSyncActive || !isDomainEnabled(domain)) {
        console.log(`[CloudSync] queueUpload(${domain}) skipped: syncActive=${isSyncActive}, enabled=${isDomainEnabled(domain)}`);
        return;
      }

      const logicalDomain = getLogicalCloudSyncDomainForPhysical(domain);
      const now = Date.now();
      const timestamp = new Date(now).toISOString();
      lastLocalChangeAtRef.current[domain] = timestamp;
      setPersistedLocalChangeAt(domain, timestamp);
      markLogicalDirtyPart(domain);
      uploadRetryCountRef.current[logicalDomain] = 0;

      if (!firstQueuedAtRef.current[logicalDomain]) {
        firstQueuedAtRef.current[logicalDomain] = now;
      }

      const syncState = useCloudSyncStore.getState();
      if (
        uploadInFlightRef.current[logicalDomain] ||
        getEnabledPartDomains(logicalDomain).some(
          (partDomain) => syncState.domainStatus[partDomain].isUploading
        )
      ) {
        pendingUploadAfterCurrentRef.current[logicalDomain] = true;
        clearUploadTimer(logicalDomain);
        console.log(
          `[CloudSync] queueUpload(${logicalDomain}) deferred: upload already in flight`
        );
        return;
      }

      const suppressUntil = Math.max(
        ...getLogicalCloudSyncDomainPhysicalParts(logicalDomain).map(
          (partDomain) => remoteApplySuppressUntilRef.current[partDomain]
        )
      );
      if (now < suppressUntil) {
        const remainingMs = suppressUntil - now;
        const deferMs = remainingMs + UPLOAD_DEBOUNCE_MS[domain];
        console.log(`[CloudSync] queueUpload(${logicalDomain}) deferred: suppressed for ${remainingMs}ms, will fire in ${deferMs}ms`);
        clearUploadTimer(logicalDomain);
        uploadTimersRef.current[logicalDomain] = setTimeout(() => {
          void uploadDomain(domain);
        }, deferMs);
        return;
      }

      const maxDebounce = MAX_UPLOAD_DEBOUNCE_MS[domain];
      const elapsed = now - firstQueuedAtRef.current[logicalDomain];

      clearUploadTimer(logicalDomain);

      if (elapsed >= maxDebounce) {
        console.log(`[CloudSync] queueUpload(${logicalDomain}) — max debounce reached (${elapsed}ms), uploading now`);
        void uploadDomain(domain);
      } else {
        const remainingMax = maxDebounce - elapsed;
        const delay = Math.min(UPLOAD_DEBOUNCE_MS[domain], remainingMax);
        console.log(`[CloudSync] queueUpload(${logicalDomain}) — debounce ${delay}ms (cap in ${remainingMax}ms)`);
        uploadTimersRef.current[logicalDomain] = setTimeout(() => {
          void uploadDomain(domain);
        }, delay);
      }
    },
    [
      clearUploadTimer,
      getEnabledPartDomains,
      isDomainEnabled,
      isSyncActive,
      uploadDomain,
    ]
  );

  const syncChannelRef = useRef<{ name: string; unbind: () => void } | null>(
    null
  );
  const realtimeInFlightRef = useRef(new Set<LogicalCloudSyncDomain>());

  const handleRealtimeDomainUpdate = useCallback(
    async (
      domain: CloudSyncDomain,
      remoteUpdatedAt: string,
      remoteSyncVersion?: CloudSyncVersionState | null
    ) => {
      if (!username || !isAuthenticated || !isDomainEnabled(domain)) return;
      const logicalDomain = getLogicalCloudSyncDomainForPhysical(domain);
      if (realtimeInFlightRef.current.has(logicalDomain)) {
        const pendingUpdate = {
          triggerDomain: domain,
          updatedAt: remoteUpdatedAt,
          syncVersion: remoteSyncVersion,
        };
        if (
          shouldReplacePendingRemoteUpdate(
            pendingRealtimeUpdateRef.current[logicalDomain],
            pendingUpdate
          )
        ) {
          pendingRealtimeUpdateRef.current[logicalDomain] = pendingUpdate;
        }
        return;
      }

      let metadataMap = useCloudSyncStore.getState().remoteMetadata;
      try {
        metadataMap = await fetchPhysicalCloudSyncMetadata({ username, isAuthenticated });
        useCloudSyncStore.getState().setRemoteMetadata(metadataMap);
      } catch (error) {
        console.warn(
          `[CloudSync] Failed to refresh metadata for realtime logical update ${logicalDomain}:`,
          error
        );
      }

      const enabledPartDomains = getEnabledPartDomains(logicalDomain);
      const candidatePartDomains: CloudSyncDomain[] = [];

      for (const partDomain of enabledPartDomains) {
        const syncState = useCloudSyncStore.getState();
        const domainStatus = syncState.domainStatus[partDomain];
        const fetchedRemoteMetadata = metadataMap[partDomain];
        const remoteMetadata =
          partDomain === domain
            ? {
                updatedAt:
                  parseCloudSyncTimestamp(remoteUpdatedAt) >
                  parseCloudSyncTimestamp(fetchedRemoteMetadata?.updatedAt)
                    ? remoteUpdatedAt
                    : fetchedRemoteMetadata?.updatedAt || remoteUpdatedAt,
                version: fetchedRemoteMetadata?.version || 1,
                totalSize: fetchedRemoteMetadata?.totalSize || 0,
                createdAt: fetchedRemoteMetadata?.createdAt || remoteUpdatedAt,
                syncVersion:
                  remoteSyncVersion || fetchedRemoteMetadata?.syncVersion || null,
              }
            : fetchedRemoteMetadata;

        if (!remoteMetadata) {
          continue;
        }

        const hasUnsynced = hasUnsyncedLocalChanges(
          lastLocalChangeAtRef.current[partDomain],
          domainStatus.lastUploadedAt,
          hasPendingUploadForDomain(partDomain) || domainStatus.isUploading
        );
        const shouldApplyMetadata = shouldApplyRemoteUpdate({
          remoteUpdatedAt: remoteMetadata.updatedAt,
          remoteSyncVersion: remoteMetadata.syncVersion,
          lastAppliedRemoteAt: domainStatus.lastAppliedRemoteAt,
          lastUploadedAt: domainStatus.lastUploadedAt,
          lastLocalChangeAt: lastLocalChangeAtRef.current[partDomain],
          hasPendingUpload:
            hasPendingUploadForDomain(partDomain) || domainStatus.isUploading,
          lastKnownServerVersion: domainStatus.lastKnownServerVersion,
        });
        if (
          !shouldApplyMetadata &&
          shouldRecheckRemoteAfterLocalSync({
            remoteUpdatedAt: remoteMetadata.updatedAt,
            remoteSyncVersion: remoteMetadata.syncVersion,
            lastAppliedRemoteAt: domainStatus.lastAppliedRemoteAt,
            lastUploadedAt: domainStatus.lastUploadedAt,
            lastLocalChangeAt: lastLocalChangeAtRef.current[partDomain],
            hasPendingUpload:
              hasPendingUploadForDomain(partDomain) || domainStatus.isUploading,
            lastKnownServerVersion: domainStatus.lastKnownServerVersion,
          })
        ) {
          pendingRemoteCatchUpRef.current[partDomain] = {
            updatedAt: remoteMetadata.updatedAt,
            syncVersion: remoteMetadata.syncVersion,
          };
        }
        let reconcileIndividualBlobs = false;
        if (
          !shouldApplyMetadata &&
          !hasUnsynced &&
          isIndividualBlobSyncDomain(partDomain)
        ) {
          reconcileIndividualBlobs =
            await individualBlobDomainNeedsLocalReconcile(partDomain, {
              username,
              isAuthenticated,
            });
        }
        if (!shouldApplyMetadata && !reconcileIndividualBlobs) {
          continue;
        }

        candidatePartDomains.push(partDomain);
      }

      if (candidatePartDomains.length === 0) {
        return;
      }

      for (const partDomain of candidatePartDomains) {
        remoteApplySuppressUntilRef.current[partDomain] =
          Date.now() + REALTIME_INFLIGHT_SUPPRESSION_MS;
      }
      realtimeInFlightRef.current.add(logicalDomain);

      try {
        console.log(
          `[CloudSync] Realtime logical download: ${logicalDomain} (${candidatePartDomains.join(", ")})`
        );
        for (const partDomain of candidatePartDomains) {
          useCloudSyncStore.getState().markDownloadStart(partDomain);
        }
        const candidatePartDomainSet = new Set(candidatePartDomains);
        const downloadResult = await downloadAndApplyLogicalCloudSyncDomain(
          logicalDomain,
          {
            username,
            isAuthenticated,
          },
          {
            shouldApplyPart: (partDomain) =>
              candidatePartDomainSet.has(partDomain),
          }
        );

        for (const [partDomain, metadata] of Object.entries(
          downloadResult.partMetadata
        ) as Array<
          [
            CloudSyncDomain,
            NonNullable<(typeof downloadResult.partMetadata)[CloudSyncDomain]>
          ]
        >) {
          useCloudSyncStore
            .getState()
            .updateRemoteMetadataForDomain(partDomain, metadata);

          if (!candidatePartDomainSet.has(partDomain)) {
            continue;
          }

          useCloudSyncStore
            .getState()
            .markDownloadSuccess(partDomain, metadata);

          if (downloadResult.applied) {
            useCloudSyncStore
              .getState()
              .markRemoteApplied(partDomain, metadata);
            alignLocalChangeWithRemoteApply(
              partDomain,
              metadata.updatedAt,
              lastLocalChangeAtRef
            );
            remoteApplySuppressUntilRef.current[partDomain] =
              Date.now() + REMOTE_APPLY_SUPPRESSION_MS;
          } else {
            remoteApplySuppressUntilRef.current[partDomain] = 0;
          }
        }
      } catch (error) {
        console.error(
          `[CloudSync] Targeted logical download ${logicalDomain} failed:`,
          error
        );
        const message =
          error instanceof Error
            ? error.message
            : `Failed to download ${logicalDomain}.`;
        for (const partDomain of candidatePartDomains) {
          useCloudSyncStore.getState().markDownloadFailure(partDomain, message);
          remoteApplySuppressUntilRef.current[partDomain] = 0;
        }
      } finally {
        realtimeInFlightRef.current.delete(logicalDomain);
        const pendingUpdate = pendingRealtimeUpdateRef.current[logicalDomain];
        if (pendingUpdate) {
          pendingRealtimeUpdateRef.current[logicalDomain] = null;
          void handleRealtimeDomainUpdateRef.current(
            pendingUpdate.triggerDomain,
            pendingUpdate.updatedAt,
            pendingUpdate.syncVersion
          );
        }
      }
    },
    [
      getEnabledPartDomains,
      hasPendingUploadForDomain,
      isAuthenticated,
      isDomainEnabled,
      username,
    ]
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
      const metadataMap = await fetchPhysicalCloudSyncMetadata({
        username,
        isAuthenticated,
      });
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

      for (const logicalDomain of LOGICAL_CLOUD_SYNC_DOMAINS) {
        if (
          !isLogicalCloudSyncDomainEnabled(
            useCloudSyncStore.getState().isDomainEnabled,
            logicalDomain
          )
        ) {
          continue;
        }

        const partDomains = getLogicalCloudSyncDomainPhysicalParts(logicalDomain).filter(
          (domain) => isDomainEnabled(domain)
        );

        let shouldDownloadLogicalDomain = false;
        const candidatePartDomains: CloudSyncDomain[] = [];

        for (const domain of partDomains) {
          const remoteMetadata = metadataMap[domain];
          const syncState = useCloudSyncStore.getState();
          const domainStatus = syncState.domainStatus[domain];

          if (!remoteMetadata) {
            continue;
          }

          const hasUnsynced = hasUnsyncedLocalChanges(
            lastLocalChangeAtRef.current[domain],
            domainStatus.lastUploadedAt,
            hasPendingUploadForDomain(domain) || domainStatus.isUploading
          );
          const shouldApplyMetadata = shouldApplyRemoteUpdate({
            remoteUpdatedAt: remoteMetadata.updatedAt,
            remoteSyncVersion: remoteMetadata.syncVersion,
            lastAppliedRemoteAt: domainStatus.lastAppliedRemoteAt,
            lastUploadedAt: domainStatus.lastUploadedAt,
            lastLocalChangeAt: lastLocalChangeAtRef.current[domain],
            hasPendingUpload:
              hasPendingUploadForDomain(domain) || domainStatus.isUploading,
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
                hasPendingUploadForDomain(domain) ||
                domainStatus.isUploading,
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

          shouldDownloadLogicalDomain = true;
          candidatePartDomains.push(domain);
        }

        if (!shouldDownloadLogicalDomain || candidatePartDomains.length === 0) {
          continue;
        }

        for (const domain of candidatePartDomains) {
          useCloudSyncStore.getState().markDownloadStart(domain);
        }

        try {
          const candidatePartDomainSet = new Set(candidatePartDomains);
          const downloadResult = await downloadAndApplyLogicalCloudSyncDomain(
            logicalDomain,
            {
              username,
              isAuthenticated,
            },
            {
              shouldApplyPart: (partDomain) =>
                candidatePartDomainSet.has(partDomain),
            }
          );

          for (const [domain, metadata] of Object.entries(
            downloadResult.partMetadata
          ) as Array<
            [
              CloudSyncDomain,
              NonNullable<(typeof downloadResult.partMetadata)[CloudSyncDomain]>
            ]
          >) {
            useCloudSyncStore
              .getState()
              .updateRemoteMetadataForDomain(domain, metadata);
            useCloudSyncStore.getState().markDownloadSuccess(domain, metadata);

            if (downloadResult.applied) {
              useCloudSyncStore.getState().markRemoteApplied(domain, metadata);
              alignLocalChangeWithRemoteApply(
                domain,
                metadata.updatedAt,
                lastLocalChangeAtRef
              );
              appliedDomains.push(domain);
            }
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : `Failed to download ${logicalDomain}.`;
          for (const domain of candidatePartDomains) {
            useCloudSyncStore.getState().markDownloadFailure(domain, message);
          }
          throw error;
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
    for (const logicalDomain of LOGICAL_CLOUD_SYNC_DOMAINS) {
      const enabledPartDomains = getEnabledPartDomains(logicalDomain);
      if (enabledPartDomains.length === 0) continue;

      const localChangeTs = parseCloudSyncTimestamp(
        getLatestLogicalLocalChangeAt(
          enabledPartDomains,
          lastLocalChangeAtRef
        )
      );

      if (localChangeTs === 0) continue;

      const lastSyncedTs = Math.max(
        ...enabledPartDomains.map((domain) =>
          Math.max(
            parseCloudSyncTimestamp(syncState.domainStatus[domain].lastUploadedAt),
            parseCloudSyncTimestamp(
              syncState.domainStatus[domain].lastAppliedRemoteAt
            )
          )
        )
      );

      if (localChangeTs > lastSyncedTs) {
        const representativeDomain = enabledPartDomains[0];
        setTimeout(
          () => queueUpload(representativeDomain),
          REMOTE_APPLY_SUPPRESSION_MS + 1000
        );
      }
    }
  }, [getEnabledPartDomains, queueUpload]);

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
        if (isApplyingRemoteDomain("files-metadata")) return;
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

    const domainCheckUnsubscribe = subscribeToCloudSyncDomainCheckRequests(
      (domain) => {
        if (!username || !isAuthenticated || !isDomainEnabled(domain)) return;
        console.log(`[CloudSync] Domain-specific sync check requested: ${domain}`);
        void (async () => {
          try {
            const metadataMap = await fetchPhysicalCloudSyncMetadata({ username, isAuthenticated });
            useCloudSyncStore.getState().setRemoteMetadata(metadataMap);
            const remoteMeta = metadataMap[domain];
            if (remoteMeta?.updatedAt) {
              void handleRealtimeDomainUpdateRef.current(
                domain,
                remoteMeta.updatedAt,
                remoteMeta.syncVersion
              );
            }
          } catch (error) {
            console.warn(`[CloudSync] Domain check metadata fetch failed for ${domain}:`, error);
          }
        })();
      }
    );

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
        setCloudSyncLanguageInitialized(true);
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
          if (
            isApplyingRemoteSettingsSection("display") ||
            isApplyingRemoteDomain("custom-wallpapers")
          ) {
            return;
          }
          markSettingsSectionChanged("display");
          queueUpload("settings");
        }
        if (
          state.currentWallpaper !== prevState.currentWallpaper &&
          state.currentWallpaper.startsWith("indexeddb://")
        ) {
          if (
            isApplyingRemoteSettingsSection("display") ||
            isApplyingRemoteDomain("custom-wallpapers")
          ) {
            return;
          }
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
        if (isApplyingRemoteDomain("songs")) return;
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
        if (isApplyingRemoteDomain("videos")) return;
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
          if (isApplyingRemoteDomain("stickies")) return;
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
        if (isApplyingRemoteDomain("calendar")) return;
        queueUpload("calendar");
      }
    });

    const contactsUnsubscribe = useContactsStore.subscribe((state, prevState) => {
      if (state.contacts !== prevState.contacts) {
        if (isApplyingRemoteDomain("contacts")) return;
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
      const logicalDomain = getLogicalCloudSyncDomainForPhysical(d);
      if (uploadTimersRef.current[logicalDomain]) {
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
      domainCheckUnsubscribe();
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
