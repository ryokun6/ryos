import { create } from "zustand";
import { createPersistedStore, type PersistedStoreMeta } from "./persistAdapter";

interface SyncSettingsState extends PersistedStoreMeta {
  /** Master toggle for cloud sync */
  enabled: boolean;
  /** Automatically sync in background when enabled */
  autoSync: boolean;
  /** Include media-ish stores (soundboard, videos, karaoke, synth) */
  includeMedia: boolean;
  /** Include filesystem metadata (future use) */
  includeFiles: boolean;
  /** Timestamp of last sync attempt (ms) */
  lastSyncAt: number | null;
  /** Last sync error, if any */
  lastError: string | null;

  setEnabled: (v: boolean) => void;
  setAutoSync: (v: boolean) => void;
  setIncludeMedia: (v: boolean) => void;
  setIncludeFiles: (v: boolean) => void;
  markSyncSuccess: () => void;
  markSyncError: (message: string) => void;
  reset: () => void;
}

const STORE_NAME = "ryos:sync-settings";
const STORE_VERSION = 1;

const getInitialState = (): Omit<
  SyncSettingsState,
  | "setEnabled"
  | "setAutoSync"
  | "setIncludeMedia"
  | "setIncludeFiles"
  | "markSyncSuccess"
  | "markSyncError"
  | "reset"
> => ({
  enabled: false,
  autoSync: false,
  includeMedia: false,
  includeFiles: false,
  lastSyncAt: null,
  lastError: null,
  _updatedAt: Date.now(),
});

export const useSyncSettingsStore = create<SyncSettingsState>()(
  createPersistedStore(
    (set) => ({
      ...getInitialState(),
      setEnabled: (v) => set({ enabled: v, _updatedAt: Date.now() }),
      setAutoSync: (v) => set({ autoSync: v, _updatedAt: Date.now() }),
      setIncludeMedia: (v) => set({ includeMedia: v, _updatedAt: Date.now() }),
      setIncludeFiles: (v) => set({ includeFiles: v, _updatedAt: Date.now() }),
      markSyncSuccess: () =>
        set({
          lastSyncAt: Date.now(),
          lastError: null,
          _updatedAt: Date.now(),
        }),
      markSyncError: (message) =>
        set({
          lastSyncAt: Date.now(),
          lastError: message,
          _updatedAt: Date.now(),
        }),
      reset: () => set(getInitialState()),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      partialize: (state) => ({
        enabled: state.enabled,
        autoSync: state.autoSync,
        includeMedia: state.includeMedia,
        includeFiles: state.includeFiles,
        lastSyncAt: state.lastSyncAt,
        lastError: state.lastError,
        _updatedAt: state._updatedAt,
      }),
    }
  )
);
