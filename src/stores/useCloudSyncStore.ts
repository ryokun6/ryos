import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  SYNC_CATEGORIES,
  type SyncCategory,
} from "@/shared/sync2/namespaces";
import {
  mergeDeletionMarkerMaps,
  type DeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import { persistAutoSyncPreferenceToServer } from "@/utils/autoSyncPreference";

export interface CloudSyncCategoryStatus {
  lastUploadedAt: string | null;
  lastFetchedAt: string | null;
  lastAppliedRemoteAt: string | null;
  isUploading: boolean;
  isDownloading: boolean;
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

function createEmptyDeletionMarkers(): CloudSyncDeletionMarkerState {
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
  };
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
      isCheckingRemote: false,
      lastCheckedAt: null,
      lastError: null,
      categoryStatus: createInitialCategoryStatus(),
      deletionMarkers: createEmptyDeletionMarkers(),

      setAutoSyncEnabled: (enabled) => {
        set({ autoSyncEnabled: enabled });
        if (typeof window !== "undefined") {
          void persistAutoSyncPreferenceToServer(enabled);
        }
      },

      applyServerAutoSyncPreference: (enabled) =>
        set({ autoSyncEnabled: enabled }),

      setCategoryEnabled: (category, enabled) =>
        set({ [CATEGORY_TOGGLE_FIELDS[category]]: enabled } as Partial<CloudSyncStoreState>),

      isCategoryEnabled: (category) =>
        Boolean(get()[CATEGORY_TOGGLE_FIELDS[category]]),

      setCheckingRemote: (checking) =>
        set({
          isCheckingRemote: checking,
          lastCheckedAt: checking ? get().lastCheckedAt : new Date().toISOString(),
        }),

      setLastError: (error) => set({ lastError: error }),

      markCategorySyncing: (category, direction, active) =>
        set((state) => ({
          categoryStatus: {
            ...state.categoryStatus,
            [category]: {
              ...state.categoryStatus[category],
              ...(direction === "upload"
                ? { isUploading: active }
                : { isDownloading: active }),
            },
          },
        })),

      markCategoryUploaded: (category, uploadedAt) =>
        set((state) => ({
          categoryStatus: {
            ...state.categoryStatus,
            [category]: {
              ...state.categoryStatus[category],
              lastUploadedAt: uploadedAt,
            },
          },
          lastError: null,
        })),

      markCategoryApplied: (category, appliedAt) =>
        set((state) => ({
          categoryStatus: {
            ...state.categoryStatus,
            [category]: {
              ...state.categoryStatus[category],
              lastFetchedAt: appliedAt,
              lastAppliedRemoteAt: appliedAt,
            },
          },
          lastError: null,
        })),

      markDeletedKeys: (bucket, keys, deletedAt = new Date().toISOString()) =>
        set((state) => {
          const nextBucket = { ...state.deletionMarkers[bucket] };
          let changed = false;
          for (const key of keys) {
            if (!key) continue;
            if (nextBucket[key] !== deletedAt) {
              nextBucket[key] = deletedAt;
              changed = true;
            }
          }
          if (!changed) return state;
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
          if (!changed) return state;
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
          if (!changed) return state;
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
          categoryStatus: mergePersistedCloudSyncCategoryStatus(p.categoryStatus),
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
        categoryStatus: Object.fromEntries(
          Object.entries(state.categoryStatus).map(([category, status]) => [
            category,
            {
              lastUploadedAt: status.lastUploadedAt,
              lastFetchedAt: status.lastFetchedAt,
              lastAppliedRemoteAt: status.lastAppliedRemoteAt,
              isUploading: false,
              isDownloading: false,
            },
          ])
        ) as CloudSyncCategoryStatusMap,
      }),
      migrate: (persistedState) => {
        const candidate = persistedState as Partial<CloudSyncStoreState> & {
          domainStatus?: Record<string, Partial<CloudSyncCategoryStatus>>;
        };
        const categoryStatus = createInitialCategoryStatus();
        const deletionMarkers = createEmptyDeletionMarkers();

        // v13 and earlier persisted per-physical-domain status; collapse to
        // categories, preferring the newest timestamps.
        const legacyDomainToCategory: Record<string, SyncCategory> = {
          settings: "settings",
          "files-metadata": "files",
          "files-images": "files",
          "files-trash": "files",
          "files-applets": "files",
          "custom-wallpapers": "files",
          songs: "songs",
          videos: "videos",
          tv: "tv",
          stickies: "stickies",
          calendar: "calendar",
          contacts: "contacts",
          maps: "maps",
        };
        const newest = (a: string | null, b: string | null | undefined): string | null => {
          if (!b) return a;
          if (!a) return b;
          return new Date(b).getTime() > new Date(a).getTime() ? b : a;
        };
        if (candidate?.domainStatus) {
          for (const [domain, status] of Object.entries(candidate.domainStatus)) {
            const category = legacyDomainToCategory[domain];
            if (!category || !status) continue;
            categoryStatus[category] = {
              lastUploadedAt: newest(
                categoryStatus[category].lastUploadedAt,
                status.lastUploadedAt
              ),
              lastFetchedAt: newest(
                categoryStatus[category].lastFetchedAt,
                status.lastFetchedAt
              ),
              lastAppliedRemoteAt: newest(
                categoryStatus[category].lastAppliedRemoteAt,
                status.lastAppliedRemoteAt
              ),
              isUploading: false,
              isDownloading: false,
            };
          }
        } else if (candidate?.categoryStatus) {
          for (const category of SYNC_CATEGORIES) {
            const row = candidate.categoryStatus[category];
            if (row) {
              categoryStatus[category] = {
                lastUploadedAt: row.lastUploadedAt ?? null,
                lastFetchedAt: row.lastFetchedAt ?? null,
                lastAppliedRemoteAt: row.lastAppliedRemoteAt ?? null,
                isUploading: false,
                isDownloading: false,
              };
            }
          }
        }

        const candidateDeletionMarkers = candidate?.deletionMarkers;
        if (candidateDeletionMarkers) {
          for (const bucket of CLOUD_SYNC_DELETION_BUCKETS) {
            const persistedBucket = candidateDeletionMarkers[bucket];
            if (!persistedBucket || typeof persistedBucket !== "object") continue;
            deletionMarkers[bucket] = Object.fromEntries(
              Object.entries(persistedBucket).filter(
                ([key, value]) =>
                  typeof key === "string" && key.length > 0 && typeof value === "string"
              )
            );
          }
        }

        return {
          autoSyncEnabled: candidate.autoSyncEnabled ?? false,
          syncFiles: candidate.syncFiles ?? true,
          syncSettings: candidate.syncSettings ?? true,
          syncSongs: candidate.syncSongs ?? true,
          syncVideos: candidate.syncVideos ?? true,
          syncTv: candidate.syncTv ?? true,
          syncStickies: candidate.syncStickies ?? true,
          syncCalendar: candidate.syncCalendar ?? true,
          syncContacts: candidate.syncContacts ?? true,
          syncMaps: candidate.syncMaps ?? true,
          lastCheckedAt: candidate.lastCheckedAt ?? null,
          deletionMarkers,
          categoryStatus,
        };
      },
    }
  )
);
