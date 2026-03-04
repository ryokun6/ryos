import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SyncCategory =
  | "settings"
  | "files"
  | "musicLibrary"
  | "calendar"
  | "stickies";

export const SYNC_CATEGORIES: SyncCategory[] = [
  "settings",
  "files",
  "musicLibrary",
  "calendar",
  "stickies",
];

export const SYNC_CATEGORY_KEYS: Record<SyncCategory, string[]> = {
  settings: [
    "ryos:theme",
    "ryos:language",
    "ryos:language-initialized",
    "ryos:display-settings",
    "ryos:audio-settings",
    "ryos:app-store",
    "dock-storage",
  ],
  files: ["ryos:files"],
  musicLibrary: ["ryos:ipod"],
  calendar: ["calendar-storage"],
  stickies: ["stickies-storage"],
};

interface CloudSyncState {
  enabled: boolean;
  syncSettings: boolean;
  syncFiles: boolean;
  syncMusicLibrary: boolean;
  syncCalendar: boolean;
  syncStickies: boolean;
  lastSyncTimestamp: string | null;
  lastPushHashes: Record<string, string>;

  setEnabled: (enabled: boolean) => void;
  setSyncCategory: (category: SyncCategory, enabled: boolean) => void;
  setLastSyncTimestamp: (timestamp: string) => void;
  setLastPushHash: (category: string, hash: string) => void;
  getEnabledCategories: () => SyncCategory[];
}

export const useCloudSyncStore = create<CloudSyncState>()(
  persist(
    (set, get) => ({
      enabled: false,
      syncSettings: true,
      syncFiles: true,
      syncMusicLibrary: true,
      syncCalendar: true,
      syncStickies: true,
      lastSyncTimestamp: null,
      lastPushHashes: {},

      setEnabled: (enabled) => set({ enabled }),

      setSyncCategory: (category, enabled) => {
        const key = `sync${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof CloudSyncState;
        set({ [key]: enabled } as Partial<CloudSyncState>);
      },

      setLastSyncTimestamp: (timestamp) =>
        set({ lastSyncTimestamp: timestamp }),

      setLastPushHash: (category, hash) =>
        set((state) => ({
          lastPushHashes: { ...state.lastPushHashes, [category]: hash },
        })),

      getEnabledCategories: () => {
        const state = get();
        if (!state.enabled) return [];
        const categories: SyncCategory[] = [];
        if (state.syncSettings) categories.push("settings");
        if (state.syncFiles) categories.push("files");
        if (state.syncMusicLibrary) categories.push("musicLibrary");
        if (state.syncCalendar) categories.push("calendar");
        if (state.syncStickies) categories.push("stickies");
        return categories;
      },
    }),
    {
      name: "ryos:cloud-sync",
      partialize: (state) => ({
        enabled: state.enabled,
        syncSettings: state.syncSettings,
        syncFiles: state.syncFiles,
        syncMusicLibrary: state.syncMusicLibrary,
        syncCalendar: state.syncCalendar,
        syncStickies: state.syncStickies,
        lastSyncTimestamp: state.lastSyncTimestamp,
        lastPushHashes: state.lastPushHashes,
      }),
    }
  )
);
