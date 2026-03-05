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
  syncCalendar: boolean;
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
  return {
    settings: {
      lastUploadedAt: null,
      lastAppliedRemoteAt: null,
      isUploading: false,
    },
    "files-metadata": {
      lastUploadedAt: null,
      lastAppliedRemoteAt: null,
      isUploading: false,
    },
    "files-documents": {
      lastUploadedAt: null,
      lastAppliedRemoteAt: null,
      isUploading: false,
    },
    "files-images": {
      lastUploadedAt: null,
      lastAppliedRemoteAt: null,
      isUploading: false,
    },
    "files-trash": {
      lastUploadedAt: null,
      lastAppliedRemoteAt: null,
      isUploading: false,
    },
    "files-applets": {
      lastUploadedAt: null,
      lastAppliedRemoteAt: null,
      isUploading: false,
    },
    songs: {
      lastUploadedAt: null,
      lastAppliedRemoteAt: null,
      isUploading: false,
    },
    calendar: {
      lastUploadedAt: null,
      lastAppliedRemoteAt: null,
      isUploading: false,
    },
  };
}

const STORE_NAME = "ryos:cloud-sync";
const STORE_VERSION = 2;

export const useCloudSyncStore = create<CloudSyncStoreState>()(
  persist(
    (set, get) => ({
      autoSyncEnabled: false,
      syncFiles: true,
      syncSettings: true,
      syncSongs: true,
      syncCalendar: true,
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
          case "calendar":
            set({ syncCalendar: enabled });
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
          case "calendar":
            return state.syncCalendar;
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
        syncCalendar: state.syncCalendar,
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
          syncCalendar: candidate.syncCalendar ?? true,
          lastCheckedAt: candidate.lastCheckedAt ?? null,
          domainStatus,
        };
      },
    }
  )
);
