import { create } from "zustand";
import { createPersistedStore, type PersistedStoreMeta } from "./persistAdapter";
import { useAppStore } from "@/stores/useAppStore";

import type {
  ViewType,
  SortType,
} from "@/apps/finder/components/FinderMenuBar";

export interface FinderInstance {
  instanceId: string;
  currentPath: string;
  navigationHistory: string[];
  navigationIndex: number;
  viewType: ViewType;
  sortType: SortType;
  selectedFile: string | null;
}

interface FinderStoreState extends PersistedStoreMeta {
  instances: Record<string, FinderInstance>;

  // Per-path view preferences
  pathViewPreferences: Record<string, ViewType>;
  setViewTypeForPath: (path: string, type: ViewType) => void;
  getViewTypeForPath: (path: string) => ViewType;
  getDefaultViewTypeForPath: (path: string) => ViewType;

  // Instance actions
  createInstance: (instanceId: string, initialPath?: string) => void;
  removeInstance: (instanceId: string) => void;
  updateInstance: (
    instanceId: string,
    updates: Partial<Omit<FinderInstance, "instanceId">>
  ) => void;
  getInstance: (instanceId: string) => FinderInstance | null;
  getForegroundInstance: () => FinderInstance | null;
}

const STORE_NAME = "ryos:finder";
const STORE_VERSION = 1;

export const useFinderStore = create<FinderStoreState>()(
  createPersistedStore(
    (set, get) => ({
      instances: {},
      _updatedAt: Date.now(),

      pathViewPreferences: {},
      setViewTypeForPath: (path, type) =>
        set((state) => ({
          pathViewPreferences: {
            ...state.pathViewPreferences,
            [path]: type,
          },
          _updatedAt: Date.now(),
        })),
      getViewTypeForPath: (path) => {
        const state = get();
        return (
          state.pathViewPreferences[path] ||
          state.getDefaultViewTypeForPath(path)
        );
      },
      getDefaultViewTypeForPath: (path) => {
        if (path === "/") return "large";
        if (path.startsWith("/Images")) return "large";
        if (path.startsWith("/Videos")) return "large";
        if (path.startsWith("/Applications")) return "large";
        if (path.startsWith("/Applets")) return "large";
        if (path.startsWith("/Trash")) return "large";
        if (path.startsWith("/Documents")) return "list";
        if (path.startsWith("/Music")) return "list";
        return "list";
      },

      createInstance: (instanceId, initialPath = "/") =>
        set((state) => {
          if (state.instances[instanceId]) {
            return state;
          }

          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                instanceId,
                currentPath: initialPath,
                navigationHistory: [initialPath],
                navigationIndex: 0,
                viewType: state.getViewTypeForPath(initialPath),
                sortType: "name",
                selectedFile: null,
              },
            },
            _updatedAt: Date.now(),
          };
        }),

      removeInstance: (instanceId) =>
        set((state) => {
          const newInstances = { ...state.instances };
          delete newInstances[instanceId];
          return { instances: newInstances, _updatedAt: Date.now() };
        }),

      updateInstance: (instanceId, updates) =>
        set((state) => {
          if (!state.instances[instanceId]) return state;
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...state.instances[instanceId],
                ...updates,
              },
            },
            _updatedAt: Date.now(),
          };
        }),

      getInstance: (instanceId) => {
        return get().instances[instanceId] || null;
      },

      getForegroundInstance: () => {
        const appStore = useAppStore.getState();
        const foregroundInstance = appStore.getForegroundInstance();

        if (!foregroundInstance || foregroundInstance.appId !== "finder") {
          return null;
        }

        return get().instances[foregroundInstance.instanceId] || null;
      },
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      partialize: (state) => ({
        instances: state.instances,
        pathViewPreferences: state.pathViewPreferences,
        _updatedAt: state._updatedAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.instances) {
            Object.keys(state.instances).forEach((instanceId) => {
              const instance = state.instances[instanceId];
              if (instance) {
                state.instances[instanceId] = {
                  instanceId,
                  currentPath: instance.currentPath || "/",
                  navigationHistory: instance.navigationHistory || ["/"],
                  navigationIndex: instance.navigationIndex || 0,
                  viewType:
                    instance.viewType ||
                    state.getViewTypeForPath?.(instance.currentPath || "/") ||
                    "list",
                  sortType: instance.sortType || "name",
                  selectedFile: instance.selectedFile || null,
                };
              }
            });
          }

          const anyState = state as unknown as {
            pathViewPreferences?: Record<string, ViewType>;
          };
          if (!anyState.pathViewPreferences) anyState.pathViewPreferences = {};

          if (!state._updatedAt) {
            (state as unknown as { _updatedAt: number })._updatedAt = Date.now();
          }
        }
      },
    }
  )
);

// ---------------------------------------------
// Utility: calculateStorageSpace (moved from utils/storage)
// Estimate LocalStorage usage (rough) and quota.
// Returns { total, used, available, percentUsed }
export const calculateStorageSpace = () => {
  let total = 0;
  let used = 0;

  try {
    // Typical LocalStorage quota is ~10 MB – keep same heuristic
    total = 10 * 1024 * 1024;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key);
      if (value) {
        // Each UTF-16 char = 2 bytes
        used += value.length * 2;
      }
    }
  } catch (err) {
    console.error("[FinderStore] Error calculating storage space", err);
  }

  return {
    total,
    used,
    available: total - used,
    percentUsed: Math.round((used / total) * 100),
  };
};
