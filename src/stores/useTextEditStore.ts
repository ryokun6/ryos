import { create } from "zustand";
import { persist } from "zustand/middleware";
import { JSONContent } from "@tiptap/core";
import { useAppStore } from "@/stores/useAppStore";

export interface TextEditInstance {
  instanceId: string;
  filePath: string | null;
  contentJson: JSONContent | null;
  hasUnsavedChanges: boolean;
}

export interface TextEditStoreState {
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

const CURRENT_TEXTEDIT_STORE_VERSION = 2;

export const useTextEditStore = create<TextEditStoreState>()(
  persist(
    (set, get) => ({
      // Instance state
      instances: {},

      // Instance management
      createInstance: (instanceId) =>
        set((state) => {
          // Don't create if instance already exists
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
          };
        }),

      removeInstance: (instanceId) =>
        set((state) => {
          const newInstances = { ...state.instances };
          delete newInstances[instanceId];
          return { instances: newInstances };
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
        // Get the foreground app instance from app store
        const appStore = useAppStore.getState();
        const foregroundInstance = appStore.getForegroundInstance();

        if (!foregroundInstance || foregroundInstance.appId !== "textedit") {
          return null;
        }

        return get().instances[foregroundInstance.instanceId] || null;
      },
    }),
    {
      name: "ryos:textedit",
      version: CURRENT_TEXTEDIT_STORE_VERSION,
      migrate: (persistedState: unknown, version: number) => {
        // Migrate from v1 to v2 (single window to multi-instance)
        // Legacy state is migrated but not used at runtime anymore
        if (version < 2) {
          return {
            instances: {},
          };
        }

        return persistedState;
      },
      partialize: (state) => ({
        instances: Object.fromEntries(
          Object.entries(state.instances).map(([id, inst]) => {
            const shouldKeepContent = !inst.filePath || inst.hasUnsavedChanges;
            return [
              id,
              {
                ...inst,
                // Only persist editor state for new/unsaved documents
                contentJson: shouldKeepContent ? inst.contentJson : null,
              },
            ];
          })
        ),
      }),
    }
  )
);
