import { create } from "zustand";
import { createPersistedStore, type PersistedStoreMeta } from "./persistAdapter";
import { JSONContent } from "@tiptap/core";
import { useAppStore } from "@/stores/useAppStore";

export interface TextEditInstance {
  instanceId: string;
  filePath: string | null;
  contentJson: JSONContent | null;
  hasUnsavedChanges: boolean;
}

export interface TextEditStoreState extends PersistedStoreMeta {
  // Instance management
  instances: Record<string, TextEditInstance>;

  // Instance actions
  createInstance: (instanceId: string) => void;
  removeInstance: (instanceId: string) => void;
  updateInstance: (
    instanceId: string,
    updates: Partial<Omit<TextEditInstance, "instanceId">>
  ) => void;
  getInstanceByPath: (path: string) => TextEditInstance | null;
  getInstanceIdByPath: (path: string) => string | null;
  getForegroundInstance: () => TextEditInstance | null;
}

const STORE_NAME = "ryos:textedit";
const STORE_VERSION = 1;

export const useTextEditStore = create<TextEditStoreState>()(
  createPersistedStore(
    (set, get) => ({
      instances: {},
      _updatedAt: Date.now(),

      createInstance: (instanceId) =>
        set((state) => {
          if (state.instances[instanceId]) {
            return state;
          }

          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                instanceId,
                filePath: null,
                contentJson: null,
                hasUnsavedChanges: false,
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

      getInstanceByPath: (path) => {
        const instances = Object.values(get().instances);
        return instances.find((inst) => inst.filePath === path) || null;
      },

      getInstanceIdByPath: (path) => {
        const instances = get().instances;
        for (const [id, instance] of Object.entries(instances)) {
          if (instance.filePath === path) {
            return id;
          }
        }
        return null;
      },

      getForegroundInstance: () => {
        const appStore = useAppStore.getState();
        const foregroundInstance = appStore.getForegroundInstance();

        if (!foregroundInstance || foregroundInstance.appId !== "textedit") {
          return null;
        }

        return get().instances[foregroundInstance.instanceId] || null;
      },
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      partialize: (state) => ({
        instances: Object.fromEntries(
          Object.entries(state.instances).map(([id, inst]) => {
            const shouldKeepContent = !inst.filePath || inst.hasUnsavedChanges;
            return [
              id,
              {
                ...inst,
                contentJson: shouldKeepContent ? inst.contentJson : null,
              },
            ];
          })
        ),
        _updatedAt: state._updatedAt,
      }),
    }
  )
);
