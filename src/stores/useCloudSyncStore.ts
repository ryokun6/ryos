import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  SYNC_CATEGORIES,
  type SyncCategory,
} from "@/shared/sync2/namespaces";
import {
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import { persistAutoSyncPreferenceToServer } from "@/utils/autoSyncPreference";
import { createDebouncedPersistStorage } from "@/utils/debouncedPersistStorage";
import { cloudSyncLog } from "@/sync/logging";

export interface CloudSyncCategoryStatus {
  lastUploadedAt: string | null;
  lastFetchedAt: string | null;
  lastAppliedRemoteAt: string | null;
  isUploading: boolean;
  isDownloading: boolean;
  uploadProgress: number | null;
  downloadProgress: number | null;
}

export type CloudSyncCategoryStatusMap = Record<
  SyncCategory,
  CloudSyncCategoryStatus
>;

export const CLOUD_SYNC_DELETION_BUCKETS = [
  "calendarTodoIds",
  "calendarEventIds",
  "calendarIds",
  "stickyNoteIds",
  "contactIds",
  "fileMetadataPaths",
  "fileImageKeys",
  "fileBookKeys",
  "fileTrashKeys",
  "fileAppletKeys",
  "customWallpaperKeys",
  "songTrackIds",
  "tvCustomChannelIds",
  "mapsFavoriteIds",
] as const;

export type CloudSyncDeletionBucket =
  (typeof CLOUD_SYNC_DELETION_BUCKETS)[number];

export type CloudSyncDeletionMarkerState = Record<
  CloudSyncDeletionBucket,
  DeletionMarkerMap
>;

export function createEmptyDeletionMarkers(): CloudSyncDeletionMarkerState {
  return {
    calendarTodoIds: {},
    calendarEventIds: {},
    calendarIds: {},
    stickyNoteIds: {},
    contactIds: {},
    fileMetadataPaths: {},
    fileImageKeys: {},
    fileBookKeys: {},
    fileTrashKeys: {},
    fileAppletKeys: {},
    customWallpaperKeys: {},
    songTrackIds: {},
    tvCustomChannelIds: {},
    mapsFavoriteIds: {},
  };
}

function createInitialCategoryStatus(): CloudSyncCategoryStatusMap {
  const empty = (): CloudSyncCategoryStatus => ({
    lastUploadedAt: null,
    lastFetchedAt: null,
    lastAppliedRemoteAt: null,
    isUploading: false,
    isDownloading: false,
    uploadProgress: null,
    downloadProgress: null,
  });
  return {
    files: empty(),
    settings: empty(),
    songs: empty(),
    videos: empty(),
    tv: empty(),
    stickies: empty(),
    calendar: empty(),
    contacts: empty(),
    maps: empty(),
    books: empty(),
  };
}

export function mergePersistedDeletionMarkers(
  partial: Partial<CloudSyncDeletionMarkerState> | undefined
): CloudSyncDeletionMarkerState {
  const next = createEmptyDeletionMarkers();
  if (!partial || typeof partial !== "object") return next;
  for (const bucket of CLOUD_SYNC_DELETION_BUCKETS) {
    next[bucket] = normalizeDeletionMarkerMap(partial[bucket]);
  }
  return next;
}

export function mergePersistedCloudSyncCategoryStatus(
  partial: Partial<CloudSyncCategoryStatusMap> | undefined
): CloudSyncCategoryStatusMap {
  const next = createInitialCategoryStatus();
  if (!partial) return next;
  for (const category of SYNC_CATEGORIES) {
    const row = partial[category];
    if (row && typeof row === "object") {
      next[category] = {
        lastUploadedAt: row.lastUploadedAt ?? null,
        lastFetchedAt: row.lastFetchedAt ?? null,
        lastAppliedRemoteAt: row.lastAppliedRemoteAt ?? null,
        isUploading: false,
        isDownloading: false,
        uploadProgress: null,
        downloadProgress: null,
      };
    }
  }
  return next;
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
  syncBooks: boolean;
  isCheckingRemote: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  categoryStatus: CloudSyncCategoryStatusMap;
  deletionMarkers: CloudSyncDeletionMarkerState;
  setAutoSyncEnabled: (enabled: boolean) => void;
  /** Apply server preference without writing back (login / new device). */
  applyServerAutoSyncPreference: (enabled: boolean) => void;
  setCategoryEnabled: (category: SyncCategory, enabled: boolean) => void;
  isCategoryEnabled: (category: SyncCategory) => boolean;
  setCheckingRemote: (checking: boolean) => void;
  setLastError: (error: string | null) => void;
  markCategorySyncing: (
    category: SyncCategory,
    direction: "upload" | "download",
    active: boolean
  ) => void;
  markCategoryUploadProgress: (
    category: SyncCategory,
    progress: number | null
  ) => void;
  markCategoryDownloadProgress: (
    category: SyncCategory,
    progress: number | null
  ) => void;
  markCategoryUploaded: (category: SyncCategory, uploadedAt: string) => void;
  markCategoryApplied: (category: SyncCategory, appliedAt: string) => void;
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

const STORE_NAME = "ryos:cloud-sync";
const STORE_VERSION = 14;

const CATEGORY_TOGGLE_FIELDS: Record<SyncCategory, keyof CloudSyncStoreState> = {
  files: "syncFiles",
  settings: "syncSettings",
  songs: "syncSongs",
  videos: "syncVideos",
  tv: "syncTv",
  stickies: "syncStickies",
  calendar: "syncCalendar",
  contacts: "syncContacts",
  maps: "syncMaps",
  books: "syncBooks",
};

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
      syncBooks: true,
      isCheckingRemote: false,
      lastCheckedAt: null,
      lastError: null,
      categoryStatus: createInitialCategoryStatus(),
      deletionMarkers: createEmptyDeletionMarkers(),

      setAutoSyncEnabled: (enabled) => {
        cloudSyncLog.debug("Auto Sync preference changed locally", { enabled });
        set({ autoSyncEnabled: enabled });
        if (typeof window !== "undefined") {
          void persistAutoSyncPreferenceToServer(enabled);
        }
      },

      applyServerAutoSyncPreference: (enabled) => {
        cloudSyncLog.debug("Auto Sync preference applied from server", {
          enabled,
        });
        set({ autoSyncEnabled: enabled });
      },

      setCategoryEnabled: (category, enabled) => {
        cloudSyncLog.debug("Category preference changed", { category, enabled });
        set({ [CATEGORY_TOGGLE_FIELDS[category]]: enabled } as Partial<CloudSyncStoreState>);
      },

      isCategoryEnabled: (category) =>
        Boolean(get()[CATEGORY_TOGGLE_FIELDS[category]]),

      setCheckingRemote: (checking) => {
        cloudSyncLog.debug("Remote check state changed", { checking });
        set({
          isCheckingRemote: checking,
          lastCheckedAt: checking ? get().lastCheckedAt : new Date().toISOString(),
        });
      },

      setLastError: (error) => {
        cloudSyncLog.debug("Last error changed", {
          hasError: Boolean(error),
          error,
        });
        set({ lastError: error });
      },

      markCategorySyncing: (category, direction, active) => {
        cloudSyncLog.debug("Category sync state changed", {
          category,
          direction,
          active,
        });
        set((state) => ({
          categoryStatus: {
            ...state.categoryStatus,
            [category]: {
              ...state.categoryStatus[category],
              ...(direction === "upload"
                ? {
                    isUploading: active,
                    ...(!active ? { uploadProgress: null } : {}),
                  }
                : {
                    isDownloading: active,
                    ...(!active ? { downloadProgress: null } : {}),
                  }),
            },
          },
        }));
      },

      markCategoryUploadProgress: (category, progress) =>
        set((state) => {
          const normalized =
            typeof progress === "number" && Number.isFinite(progress)
              ? Math.round(Math.max(0, Math.min(100, progress)))
              : null;
          if (state.categoryStatus[category].uploadProgress === normalized) {
            return state;
          }
          return {
            categoryStatus: {
              ...state.categoryStatus,
              [category]: {
                ...state.categoryStatus[category],
                uploadProgress: normalized,
              },
            },
          };
        }),

      markCategoryDownloadProgress: (category, progress) =>
        set((state) => {
          const normalized =
            typeof progress === "number" && Number.isFinite(progress)
              ? Math.round(Math.max(0, Math.min(100, progress)))
              : null;
          if (state.categoryStatus[category].downloadProgress === normalized) {
            return state;
          }
          return {
            categoryStatus: {
              ...state.categoryStatus,
              [category]: {
                ...state.categoryStatus[category],
                downloadProgress: normalized,
              },
            },
          };
        }),

      markCategoryUploaded: (category, uploadedAt) => {
        cloudSyncLog.debug("Category upload marked complete", {
          category,
          uploadedAt,
        });
        set((state) => ({
          categoryStatus: {
            ...state.categoryStatus,
            [category]: {
              ...state.categoryStatus[category],
              lastUploadedAt: uploadedAt,
              uploadProgress: null,
            },
          },
          lastError: null,
        }));
      },

      markCategoryApplied: (category, appliedAt) => {
        cloudSyncLog.debug("Category remote apply marked complete", {
          category,
          appliedAt,
        });
        set((state) => ({
          categoryStatus: {
            ...state.categoryStatus,
            [category]: {
              ...state.categoryStatus[category],
              lastFetchedAt: appliedAt,
              lastAppliedRemoteAt: appliedAt,
              downloadProgress: null,
            },
          },
          lastError: null,
        }));
      },

      markDeletedKeys: (bucket, keys, deletedAt = new Date().toISOString()) =>
        set((state) => {
          const nextBucket = { ...(state.deletionMarkers[bucket] ?? {}) };
          let changed = false;
          let markerCount = 0;
          for (const key of keys) {
            if (!key) continue;
            markerCount += 1;
            if (nextBucket[key] !== deletedAt) {
              nextBucket[key] = deletedAt;
              changed = true;
            }
          }
          if (!changed) return state;
          cloudSyncLog.debug("Deletion markers added", {
            bucket,
            markerCount,
          });
          return {
            deletionMarkers: {
              ...state.deletionMarkers,
              [bucket]: nextBucket,
            },
          };
        }),

      clearDeletedKeys: (bucket, keys) =>
        set((state) => {
          const nextBucket = { ...(state.deletionMarkers[bucket] ?? {}) };
          let changed = false;
          let clearedCount = 0;
          for (const key of keys) {
            if (key && key in nextBucket) {
              delete nextBucket[key];
              changed = true;
              clearedCount += 1;
            }
          }
          if (!changed) return state;
          cloudSyncLog.debug("Deletion markers cleared", {
            bucket,
            clearedCount,
          });
          return {
            deletionMarkers: {
              ...state.deletionMarkers,
              [bucket]: nextBucket,
            },
          };
        }),

      mergeDeletedKeys: (bucket, markers) =>
        set((state) => {
          const currentBucket = state.deletionMarkers[bucket] ?? {};
          const nextBucket = mergeDeletionMarkerMaps(currentBucket, markers);
          const changed =
            Object.keys(nextBucket).length !== Object.keys(currentBucket).length ||
            Object.entries(nextBucket).some(
              ([key, value]) => currentBucket[key] !== value
            );
          if (!changed) return state;
          cloudSyncLog.debug("Deletion markers merged", {
            bucket,
            incomingCount: Object.keys(markers).length,
            markerCount: Object.keys(nextBucket).length,
          });
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
      storage: createDebouncedPersistStorage(),
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return currentState;
        }
        const p = persistedState as Partial<CloudSyncStoreState>;
        return {
          ...currentState,
          ...p,
          categoryStatus: mergePersistedCloudSyncCategoryStatus(p.categoryStatus),
          deletionMarkers: mergePersistedDeletionMarkers(p.deletionMarkers),
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
        syncBooks: state.syncBooks,
        lastCheckedAt: state.lastCheckedAt,
        deletionMarkers: state.deletionMarkers,
        categoryStatus: Object.fromEntries(
          Object.entries(state.categoryStatus).map(([category, status]) => [
            category,
            {
              lastUploadedAt: status.lastUploadedAt,
              lastFetchedAt: status.lastFetchedAt,
              lastAppliedRemoteAt: status.lastAppliedRemoteAt,
              isUploading: false,
              isDownloading: false,
              uploadProgress: null,
              downloadProgress: null,
            },
          ])
        ) as CloudSyncCategoryStatusMap,
      }),
    }
  )
);
