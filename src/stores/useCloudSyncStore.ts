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

interface CloudSyncDomainStatus {
  lastUploadedAt: string | null;
  lastAppliedRemoteAt: string | null;
  isUploading: boolean;
}

type CloudSyncDomainStatusMap = Record<CloudSyncDomain, CloudSyncDomainStatus>;

interface CloudSyncStoreState {
  autoSyncEnabled: boolean;
  syncFiles: boolean;
  syncSettings: boolean;
  syncSongs: boolean;
  syncVideos: boolean;
  syncStickies: boolean;
  syncCalendar: boolean;
  syncContacts: boolean;
  isCheckingRemote: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  remoteMetadata: CloudSyncMetadataMap;
  domainStatus: CloudSyncDomainStatusMap;
  setAutoSyncEnabled: (enabled: boolean) => void;
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
  markUploadSuccess: (domain: CloudSyncDomain, uploadedAt: string) => void;
  markUploadFailure: (domain: CloudSyncDomain, error: string) => void;
  markRemoteApplied: (domain: CloudSyncDomain, appliedAt: string) => void;
}

function createInitialDomainStatus(): CloudSyncDomainStatusMap {
  const empty = (): CloudSyncDomainStatus => ({
    lastUploadedAt: null,
    lastAppliedRemoteAt: null,
    isUploading: false,
  });

  return {
    settings: empty(),
    "files-metadata": empty(),
    "files-documents": empty(),
    "files-images": empty(),
    "files-trash": empty(),
    "files-applets": empty(),
    songs: empty(),
    videos: empty(),
    stickies: empty(),
    calendar: empty(),
    contacts: empty(),
    "custom-wallpapers": empty(),
  };
}

const STORE_NAME = "ryos:cloud-sync";
const STORE_VERSION = 5;

export const useCloudSyncStore = create<CloudSyncStoreState>()(
  persist(
    (set, get) => ({
      autoSyncEnabled: false,
      syncFiles: true,
      syncSettings: true,
      syncSongs: true,
      syncVideos: true,
      syncStickies: true,
      syncCalendar: true,
      syncContacts: true,
      isCheckingRemote: false,
      lastCheckedAt: null,
      lastError: null,
      remoteMetadata: createEmptyCloudSyncMetadataMap(),
      domainStatus: createInitialDomainStatus(),

      setAutoSyncEnabled: (enabled) => set({ autoSyncEnabled: enabled }),

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
          case "stickies":
            set({ syncStickies: enabled });
            return;
          case "calendar":
            set({ syncCalendar: enabled });
            return;
          case "contacts":
            set({ syncContacts: enabled });
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
          case "stickies":
            return state.syncStickies;
          case "calendar":
            return state.syncCalendar;
          case "contacts":
            return state.syncContacts;
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

      markUploadSuccess: (domain, uploadedAt) =>
        set((state) => ({
          domainStatus: {
            ...state.domainStatus,
            [domain]: {
              ...state.domainStatus[domain],
              isUploading: false,
              lastUploadedAt: uploadedAt,
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

      markRemoteApplied: (domain, appliedAt) =>
        set((state) => ({
          domainStatus: {
            ...state.domainStatus,
            [domain]: {
              ...state.domainStatus[domain],
              lastAppliedRemoteAt: appliedAt,
            },
          },
          lastError: null,
        })),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        autoSyncEnabled: state.autoSyncEnabled,
        syncFiles: state.syncFiles,
        syncSettings: state.syncSettings,
        syncSongs: state.syncSongs,
        syncVideos: state.syncVideos,
        syncStickies: state.syncStickies,
        syncCalendar: state.syncCalendar,
        syncContacts: state.syncContacts,
        lastCheckedAt: state.lastCheckedAt,
        domainStatus: Object.fromEntries(
          Object.entries(state.domainStatus).map(([domain, status]) => [
            domain,
            {
              lastUploadedAt: status.lastUploadedAt,
              lastAppliedRemoteAt: status.lastAppliedRemoteAt,
              isUploading: false,
            },
          ])
        ) as CloudSyncDomainStatusMap,
      }),
      migrate: (persistedState) => {
        const candidate = persistedState as Partial<CloudSyncStoreState>;
        const domainStatus = createInitialDomainStatus();

        if (candidate?.domainStatus) {
          for (const domain of Object.keys(domainStatus) as CloudSyncDomain[]) {
            const saved = candidate.domainStatus[domain];
            if (saved) {
              domainStatus[domain] = {
                lastUploadedAt: saved.lastUploadedAt ?? null,
                lastAppliedRemoteAt: saved.lastAppliedRemoteAt ?? null,
                isUploading: false,
              };
            }
          }

          const legacyFilesStatus = (
            candidate.domainStatus as Partial<Record<string, CloudSyncDomainStatus>>
          ).files;
          if (legacyFilesStatus) {
            for (const domain of [
              "files-metadata",
              "files-documents",
              "files-images",
              "files-trash",
              "files-applets",
            ] as CloudSyncDomain[]) {
              if (!domainStatus[domain].lastUploadedAt) {
                domainStatus[domain] = {
                  lastUploadedAt: legacyFilesStatus.lastUploadedAt ?? null,
                  lastAppliedRemoteAt:
                    legacyFilesStatus.lastAppliedRemoteAt ?? null,
                  isUploading: false,
                };
              }
            }
          }
        }

        return {
          autoSyncEnabled: candidate.autoSyncEnabled ?? false,
          syncFiles: candidate.syncFiles ?? true,
          syncSettings: candidate.syncSettings ?? true,
          syncSongs: candidate.syncSongs ?? true,
          syncVideos: (candidate as Record<string, unknown>).syncVideos as boolean ?? true,
          syncStickies: (candidate as Record<string, unknown>).syncStickies as boolean ?? true,
          syncCalendar: candidate.syncCalendar ?? true,
          syncContacts: (candidate as Record<string, unknown>).syncContacts as boolean ?? true,
          lastCheckedAt: candidate.lastCheckedAt ?? null,
          domainStatus,
        };
      },
    }
  )
);
