import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { JSONContent } from "@tiptap/core";
import { useAppStore } from "@/stores/useAppStore";
import { STORES } from "@/utils/indexedDB";
import {
  createSplitIndexedDBPersistStorage,
  type SplitPersistSnapshot,
} from "@/utils/splitIndexedDBPersistStorage";

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

type TextEditPersistedState = Pick<TextEditStoreState, "instances">;

const splitTextEditState = (
  state: TextEditPersistedState
): SplitPersistSnapshot<TextEditPersistedState> => ({
  metadata: { instances: {} },
  rows: {
    [STORES.TEXTEDIT_INSTANCES]: Object.entries(state.instances).map(
      ([instanceId, instance]) => ({
        key: instanceId,
        value: { instance },
        revision: instance,
      })
    ),
  },
});

const mergeTextEditState = (
  metadata: TextEditPersistedState,
  rows: Readonly<Record<string, readonly { key: string; value: Record<string, unknown> }[]>>
): TextEditPersistedState => {
  const instances: Record<string, TextEditInstance> = {};
  for (const row of rows[STORES.TEXTEDIT_INSTANCES] ?? []) {
    const instance = row.value.instance;
    if (
      instance &&
      typeof instance === "object" &&
      !Array.isArray(instance) &&
      "instanceId" in instance
    ) {
      instances[row.key] = instance as TextEditInstance;
    }
  }
  return { ...metadata, instances };
};

export const useTextEditStore = create<TextEditStoreState>()(
  persist(
    (set, get) => ({
      instances: {},

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
      storage: createSplitIndexedDBPersistStorage<TextEditPersistedState>({
        stores: [STORES.TEXTEDIT_INSTANCES],
        layoutVersion: 1,
        persistVersion: 0,
        split: splitTextEditState,
        merge: mergeTextEditState,
      }),
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
      }),
    }
  )
);
