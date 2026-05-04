import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  CloudSyncDomain,
  CloudSyncMetadataMap,
} from "@/utils/cloudSyncShared";
import {
  createEmptyCloudSyncMetadataMap,
  getCloudSyncCategory,
} from "@/utils/cloudSyncShared";
import {
  mergeDeletionMarkerMaps,
  type DeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import { persistAutoSyncPreferenceToServer } from "@/utils/autoSyncPreference";

interface CloudSyncDomainStatus {
  lastUploadedAt: string | null;
  lastFetchedAt: string | null;
  lastAppliedRemoteAt: string | null;
  lastKnownServerVersion: number | null;
  isUploading: boolean;
  isDownloading: boolean;
}

type CloudSyncDomainStatusMap = Record<CloudSyncDomain, CloudSyncDomainStatus>;

export const CLOUD_SYNC_DELETION_BUCKETS = [
  "calendarTodoIds",
  "calendarEventIds",
  "calendarIds",
  "stickyNoteIds",
  "contactIds",
  "fileMetadataPaths",
  "fileImageKeys",
  "fileTrashKeys",
  "fileAppletKeys",
  "customWallpaperKeys",
  "songTrackIds",
  "tvCustomChannelIds",
  "mapsFavoriteIds",
  "mapsRecentIds",
] as const;

export type CloudSyncDeletionBucket =
  (typeof CLOUD_SYNC_DELETION_BUCKETS)[number];

export type CloudSyncDeletionMarkerState = Record<
  CloudSyncDeletionBucket,
  DeletionMarkerMap
>;

function createEmptyDeletionMarkers(): CloudSyncDeletionMarkerState {
  return {
    calendarTodoIds: {},
    calendarEventIds: {},
    calendarIds: {},
    stickyNoteIds: {},
    contactIds: {},
    fileMetadataPaths: {},
    fileImageKeys: {},
    fileTrashKeys: {},
    fileAppletKeys: {},
    customWallpaperKeys: {},
    songTrackIds: {},
    tvCustomChannelIds: {},
    mapsFavoriteIds: {},
    mapsRecentIds: {},
  };
}

interface CloudSyncStoreState {
  autoSyncEnabled: boolean;
  syncFiles: boolean;
  syncSettings: boolean;
  syncSongs: boolean;
  syncVideos: boolean;
  syncTv: boolean;
  syncStickies: boolean;
  syncCalendar: boolean;
  syncContacts: boolean;
  syncMaps: boolean;
  isCheckingRemote: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  remoteMetadata: CloudSyncMetadataMap;
  domainStatus: CloudSyncDomainStatusMap;
  deletionMarkers: CloudSyncDeletionMarkerState;
  setAutoSyncEnabled: (enabled: boolean) => void;
  /** Apply server preference without writing back (login / new device). */
  applyServerAutoSyncPreference: (enabled: boolean) => void;
  setDomainEnabled: (domain: CloudSyncDomain, enabled: boolean) => void;
  isDomainEnabled: (domain: CloudSyncDomain) => boolean;
  setCheckingRemote: (checking: boolean) => void;
  setLastError: (error: string | null) => void;
  setRemoteMetadata: (metadata: CloudSyncMetadataMap) => void;
  updateRemoteMetadataForDomain: (
    domain: CloudSyncDomain,
    metadata: CloudSyncMetadataMap[CloudSyncDomain]
  ) => void;
  markUploadStart: (domain: CloudSyncDomain) => void;
  markUploadSuccess: (
    domain: CloudSyncDomain,
    metadata: NonNullable<CloudSyncMetadataMap[CloudSyncDomain]> | string
  ) => void;
  markUploadFailure: (domain: CloudSyncDomain, error: string) => void;
  markDownloadStart: (domain: CloudSyncDomain) => void;
  markDownloadSuccess: (
    domain: CloudSyncDomain,
    metadata: NonNullable<CloudSyncMetadataMap[CloudSyncDomain]> | string
  ) => void;
  markDownloadFailure: (domain: CloudSyncDomain, error: string) => void;
  markRemoteApplied: (
    domain: CloudSyncDomain,
    metadata: NonNullable<CloudSyncMetadataMap[CloudSyncDomain]> | string
  ) => void;
  markDeletedKeys: (
    bucket: CloudSyncDeletionBucket,
    keys: Iterable<string>,
    deletedAt?: string
  ) => void;
  clearDeletedKeys: (
    bucket: CloudSyncDeletionBucket,
    keys: Iterable<string>
  ) => void;
  mergeDeletedKeys: (
    bucket: CloudSyncDeletionBucket,
    markers: DeletionMarkerMap
  ) => void;
}

function createInitialDomainStatus(): CloudSyncDomainStatusMap {
  const empty = (): CloudSyncDomainStatus => ({
    lastUploadedAt: null,
    lastFetchedAt: null,
    lastAppliedRemoteAt: null,
    lastKnownServerVersion: null,
    isUploading: false,
    isDownloading: false,
  });

  return {
    settings: empty(),
    "files-metadata": empty(),
    "files-images": empty(),
    "files-trash": empty(),
    "files-applets": empty(),
    songs: empty(),
    videos: empty(),
    tv: empty(),
    stickies: empty(),
    calendar: empty(),
    contacts: empty(),
    maps: empty(),
    "custom-wallpapers": empty(),
  };
}

/**
 * Zustand persist merge is shallow: a persisted `domainStatus` object with fewer
 * keys than the current schema replaces the entire map and drops new domains
 * (e.g. custom-wallpapers), causing crashes when UI iterates FILE_SYNC_DOMAINS.
 * @see tests/test-cloud-sync-persist-domain-status.test.ts
 */
export function mergePersistedCloudSyncDomainStatus(
  partial: Partial<CloudSyncDomainStatusMap> | undefined
): CloudSyncDomainStatusMap {
  const next = createInitialDomainStatus();
  if (!partial) {
    return next;
  }
  for (const domain of Object.keys(next) as CloudSyncDomain[]) {
    const row = partial[domain];
    if (row && typeof row === "object") {
      next[domain] = {
        lastUploadedAt: row.lastUploadedAt ?? null,
        lastFetchedAt: row.lastFetchedAt ?? null,
        lastAppliedRemoteAt: row.lastAppliedRemoteAt ?? null,
        lastKnownServerVersion: row.lastKnownServerVersion ?? null,
        isUploading: false,
        isDownloading: false,
      };
    }
  }
  return next;
}

const STORE_NAME = "ryos:cloud-sync";
const STORE_VERSION = 13;

export const useCloudSyncStore = create<CloudSyncStoreState>()(
  persist(
    (set, get) => ({
      autoSyncEnabled: false,
      syncFiles: true,
      syncSettings: true,
      syncSongs: true,
      syncVideos: true,
      syncTv: true,
      syncStickies: true,
      syncCalendar: true,
      syncContacts: true,
      syncMaps: true,
      isCheckingRemote: false,
      lastCheckedAt: null,
      lastError: null,
      remoteMetadata: createEmptyCloudSyncMetadataMap(),
      domainStatus: createInitialDomainStatus(),
      deletionMarkers: createEmptyDeletionMarkers(),

      setAutoSyncEnabled: (enabled) => {
        set({ autoSyncEnabled: enabled });
        if (typeof window !== "undefined") {
          void persistAutoSyncPreferenceToServer(enabled);
        }
      },

      applyServerAutoSyncPreference: (enabled) =>
        set({ autoSyncEnabled: enabled }),

      setDomainEnabled: (domain, enabled) => {
        switch (getCloudSyncCategory(domain)) {
          case "files":
            set({ syncFiles: enabled });
            return;
          case "settings":
            set({ syncSettings: enabled });
            return;
          case "songs":
            set({ syncSongs: enabled });
            return;
          case "videos":
            set({ syncVideos: enabled });
            return;
          case "tv":
            set({ syncTv: enabled });
            return;
          case "stickies":
            set({ syncStickies: enabled });
            return;
          case "calendar":
            set({ syncCalendar: enabled });
            return;
          case "contacts":
            set({ syncContacts: enabled });
            return;
          case "maps":
            set({ syncMaps: enabled });
            return;
        }
      },

      isDomainEnabled: (domain) => {
        const state = get();
        switch (getCloudSyncCategory(domain)) {
          case "files":
            return state.syncFiles;
          case "settings":
            return state.syncSettings;
          case "songs":
            return state.syncSongs;
          case "videos":
            return state.syncVideos;
          case "tv":
            return state.syncTv;
          case "stickies":
            return state.syncStickies;
          case "calendar":
            return state.syncCalendar;
          case "contacts":
            return state.syncContacts;
          case "maps":
            return state.syncMaps;
        }
      },

      setCheckingRemote: (checking) =>
        set({
          isCheckingRemote: checking,
          lastCheckedAt: checking ? get().lastCheckedAt : new Date().toISOString(),
        }),

      setLastError: (error) => set({ lastError: error }),

      setRemoteMetadata: (metadata) => set({ remoteMetadata: metadata }),

      updateRemoteMetadataForDomain: (domain, metadata) =>
        set((state) => ({
          remoteMetadata: {
            ...state.remoteMetadata,
            [domain]: metadata,
          },
        })),

      markUploadStart: (domain) =>
        set((state) => ({
          domainStatus: {
            ...state.domainStatus,
            [domain]: {
              ...state.domainStatus[domain],
              isUploading: true,
            },
          },
        })),

      markUploadSuccess: (domain, metadata) =>
        set((state) => ({
          domainStatus: {
            ...state.domainStatus,
            [domain]: {
              ...state.domainStatus[domain],
              isUploading: false,
              lastUploadedAt:
                typeof metadata === "string" ? metadata : metadata.updatedAt,
              lastKnownServerVersion:
                (typeof metadata === "string"
                  ? null
                  : metadata.syncVersion?.serverVersion) ||
                state.domainStatus[domain].lastKnownServerVersion,
            },
          },
          lastError: null,
        })),

      markUploadFailure: (domain, error) =>
        set((state) => ({
          domainStatus: {
            ...state.domainStatus,
            [domain]: {
              ...state.domainStatus[domain],
              isUploading: false,
            },
          },
          lastError: error,
        })),

      markDownloadStart: (domain) =>
        set((state) => ({
          domainStatus: {
            ...state.domainStatus,
            [domain]: {
              ...state.domainStatus[domain],
              isDownloading: true,
            },
          },
        })),

      markDownloadSuccess: (domain, metadata) =>
        set((state) => ({
          domainStatus: {
            ...state.domainStatus,
            [domain]: {
              ...state.domainStatus[domain],
              isDownloading: false,
              lastFetchedAt:
                typeof metadata === "string" ? metadata : metadata.updatedAt,
              lastKnownServerVersion:
                (typeof metadata === "string"
                  ? null
                  : metadata.syncVersion?.serverVersion) ||
                state.domainStatus[domain].lastKnownServerVersion,
            },
          },
          lastError: null,
        })),

      markDownloadFailure: (domain, error) =>
        set((state) => ({
          domainStatus: {
            ...state.domainStatus,
            [domain]: {
              ...state.domainStatus[domain],
              isDownloading: false,
            },
          },
          lastError: error,
        })),

      markRemoteApplied: (domain, metadata) =>
        set((state) => ({
          domainStatus: {
            ...state.domainStatus,
            [domain]: {
              ...state.domainStatus[domain],
              lastAppliedRemoteAt:
                typeof metadata === "string" ? metadata : metadata.updatedAt,
              lastKnownServerVersion:
                (typeof metadata === "string"
                  ? null
                  : metadata.syncVersion?.serverVersion) ||
                state.domainStatus[domain].lastKnownServerVersion,
            },
          },
          lastError: null,
        })),

      markDeletedKeys: (bucket, keys, deletedAt = new Date().toISOString()) =>
        set((state) => {
          const nextBucket = { ...state.deletionMarkers[bucket] };
          let changed = false;

          for (const key of keys) {
            if (!key) {
              continue;
            }

            if (nextBucket[key] !== deletedAt) {
              nextBucket[key] = deletedAt;
              changed = true;
            }
          }

          if (!changed) {
            return state;
          }

          return {
            deletionMarkers: {
              ...state.deletionMarkers,
              [bucket]: nextBucket,
            },
          };
        }),

      clearDeletedKeys: (bucket, keys) =>
        set((state) => {
          const nextBucket = { ...state.deletionMarkers[bucket] };
          let changed = false;

          for (const key of keys) {
            if (key && key in nextBucket) {
              delete nextBucket[key];
              changed = true;
            }
          }

          if (!changed) {
            return state;
          }

          return {
            deletionMarkers: {
              ...state.deletionMarkers,
              [bucket]: nextBucket,
            },
          };
        }),

      mergeDeletedKeys: (bucket, markers) =>
        set((state) => {
          const nextBucket = mergeDeletionMarkerMaps(
            state.deletionMarkers[bucket],
            markers
          );
          const currentBucket = state.deletionMarkers[bucket];
          const changed =
            Object.keys(nextBucket).length !== Object.keys(currentBucket).length ||
            Object.entries(nextBucket).some(
              ([key, value]) => currentBucket[key] !== value
            );

          if (!changed) {
            return state;
          }

          return {
            deletionMarkers: {
              ...state.deletionMarkers,
              [bucket]: nextBucket,
            },
          };
        }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return currentState;
        }
        const p = persistedState as Partial<CloudSyncStoreState>;
        return {
          ...currentState,
          ...p,
          domainStatus: mergePersistedCloudSyncDomainStatus(p.domainStatus),
        };
      },
      partialize: (state) => ({
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
        lastCheckedAt: state.lastCheckedAt,
        deletionMarkers: state.deletionMarkers,
        domainStatus: Object.fromEntries(
          Object.entries(state.domainStatus).map(([domain, status]) => [
            domain,
            {
              lastUploadedAt: status.lastUploadedAt,
              lastFetchedAt: status.lastFetchedAt,
              lastAppliedRemoteAt: status.lastAppliedRemoteAt,
              lastKnownServerVersion: status.lastKnownServerVersion,
              isUploading: false,
              isDownloading: false,
            },
          ])
        ) as CloudSyncDomainStatusMap,
      }),
      migrate: (persistedState) => {
        const candidate = persistedState as Partial<CloudSyncStoreState>;
        const domainStatus = createInitialDomainStatus();
        const deletionMarkers = createEmptyDeletionMarkers();

        if (candidate?.domainStatus) {
          for (const domain of Object.keys(domainStatus) as CloudSyncDomain[]) {
            const saved = candidate.domainStatus[domain];
            if (saved) {
              domainStatus[domain] = {
                lastUploadedAt: saved.lastUploadedAt ?? null,
                lastFetchedAt: saved.lastFetchedAt ?? null,
                lastAppliedRemoteAt: saved.lastAppliedRemoteAt ?? null,
                lastKnownServerVersion: saved.lastKnownServerVersion ?? null,
                isUploading: false,
                isDownloading: false,
              };
            }
          }

          const legacyFilesStatus = (
            candidate.domainStatus as Partial<Record<string, CloudSyncDomainStatus>>
          ).files;
          if (legacyFilesStatus) {
            for (const domain of [
              "files-metadata",
              "files-images",
              "files-trash",
              "files-applets",
            ] as CloudSyncDomain[]) {
              if (!domainStatus[domain].lastUploadedAt) {
                domainStatus[domain] = {
                  lastUploadedAt: legacyFilesStatus.lastUploadedAt ?? null,
                  lastFetchedAt: null,
                  lastAppliedRemoteAt:
                    legacyFilesStatus.lastAppliedRemoteAt ?? null,
                  lastKnownServerVersion:
                    legacyFilesStatus.lastKnownServerVersion ?? null,
                  isUploading: false,
                  isDownloading: false,
                };
              }
            }
          }
        }

        const candidateDeletionMarkers = (
          candidate as Partial<{ deletionMarkers: Partial<CloudSyncDeletionMarkerState> }>
        )?.deletionMarkers;
        if (candidateDeletionMarkers) {
          for (const bucket of CLOUD_SYNC_DELETION_BUCKETS) {
            const persistedBucket = candidateDeletionMarkers[bucket];
            if (!persistedBucket || typeof persistedBucket !== "object") {
              continue;
            }

            deletionMarkers[bucket] = Object.fromEntries(
              Object.entries(persistedBucket).filter(
                ([key, value]) => typeof key === "string" && key.length > 0 && typeof value === "string"
              )
            );
          }
        }

        return {
          autoSyncEnabled: candidate.autoSyncEnabled ?? false,
          syncFiles: candidate.syncFiles ?? true,
          syncSettings: candidate.syncSettings ?? true,
          syncSongs: candidate.syncSongs ?? true,
          syncVideos: (candidate as Record<string, unknown>).syncVideos as boolean ?? true,
          syncTv: (candidate as Record<string, unknown>).syncTv as boolean ?? true,
          syncStickies: (candidate as Record<string, unknown>).syncStickies as boolean ?? true,
          syncCalendar: candidate.syncCalendar ?? true,
          syncContacts: (candidate as Record<string, unknown>).syncContacts as boolean ?? true,
          syncMaps: (candidate as Record<string, unknown>).syncMaps as boolean ?? true,
          lastCheckedAt: candidate.lastCheckedAt ?? null,
          deletionMarkers,
          domainStatus,
        };
      },
    }
  )
);
