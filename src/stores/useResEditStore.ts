import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAppStore } from "@/stores/useAppStore";

export interface ResourceItem {
  id: string;
  type: string;
  name: string;
  data: unknown;
  size: number;
  modified: boolean;
}

export interface ResEditInstance {
  instanceId: string;
  filePath: string | null;
  resources: ResourceItem[];
  selectedResource: string | null;
  hasUnsavedChanges: boolean;
}

export interface ResEditStoreState {
  // Instance management
  instances: Record<string, ResEditInstance>;

  // Legacy single-window support (deprecated, kept for migration)
  filePath: string | null;
  resources: ResourceItem[];
  selectedResource: string | null;
  hasUnsavedChanges: boolean;

  // Instance actions
  createInstance: (instanceId: string) => void;
  removeInstance: (instanceId: string) => void;
  updateInstance: (
    instanceId: string,
    updates: Partial<Omit<ResEditInstance, "instanceId">>
  ) => void;
  getInstanceByPath: (path: string) => ResEditInstance | null;
  getInstanceIdByPath: (path: string) => string | null;
  getForegroundInstance: () => ResEditInstance | null;

  // Resource management
  addResource: (instanceId: string, resource: ResourceItem) => void;
  updateResource: (instanceId: string, resourceId: string, updates: Partial<ResourceItem>) => void;
  removeResource: (instanceId: string, resourceId: string) => void;
  selectResource: (instanceId: string, resourceId: string | null) => void;

  // Legacy actions (now operate on foreground instance)
  setFilePath: (path: string | null) => void;
  setResources: (resources: ResourceItem[]) => void;
  setSelectedResource: (resourceId: string | null) => void;
  setHasUnsavedChanges: (val: boolean) => void;
  reset: () => void;
}

const CURRENT_RESEDIT_STORE_VERSION = 1;

export const useResEditStore = create<ResEditStoreState>()(
  persist(
    (set, get) => ({
      // Instance state
      instances: {},

      // Legacy state (deprecated)
      filePath: null,
      resources: [],
      selectedResource: null,
      hasUnsavedChanges: false,

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
                resources: [],
                selectedResource: null,
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

        if (!foregroundInstance || foregroundInstance.appId !== "resedit") {
          return null;
        }

        return get().instances[foregroundInstance.instanceId] || null;
      },

      // Resource management
      addResource: (instanceId, resource) =>
        set((state) => {
          if (!state.instances[instanceId]) return state;
          const instance = state.instances[instanceId];
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...instance,
                resources: [...instance.resources, resource],
                hasUnsavedChanges: true,
              },
            },
          };
        }),

      updateResource: (instanceId, resourceId, updates) =>
        set((state) => {
          if (!state.instances[instanceId]) return state;
          const instance = state.instances[instanceId];
          const updatedResources = instance.resources.map((resource) =>
            resource.id === resourceId ? { ...resource, ...updates, modified: true } : resource
          );
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...instance,
                resources: updatedResources,
                hasUnsavedChanges: true,
              },
            },
          };
        }),

      removeResource: (instanceId, resourceId) =>
        set((state) => {
          if (!state.instances[instanceId]) return state;
          const instance = state.instances[instanceId];
          const filteredResources = instance.resources.filter(
            (resource) => resource.id !== resourceId
          );
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...instance,
                resources: filteredResources,
                selectedResource: instance.selectedResource === resourceId ? null : instance.selectedResource,
                hasUnsavedChanges: true,
              },
            },
          };
        }),

      selectResource: (instanceId, resourceId) =>
        set((state) => {
          if (!state.instances[instanceId]) return state;
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...state.instances[instanceId],
                selectedResource: resourceId,
              },
            },
          };
        }),

      // Legacy actions - kept for backward compatibility but should not be used with instances
      setFilePath: (path) => {
        // Only operate on legacy store, not on instances
        set((state) => ({ ...state, filePath: path }));
      },

      setResources: (resources) => {
        // Only operate on legacy store, not on instances
        set((state) => ({ ...state, resources }));
      },

      setSelectedResource: (resourceId) => {
        // Only operate on legacy store, not on instances
        set((state) => ({ ...state, selectedResource: resourceId }));
      },

      setHasUnsavedChanges: (val) => {
        // Only operate on legacy store, not on instances
        set((state) => ({ ...state, hasUnsavedChanges: val }));
      },

      reset: () => {
        // This method should only be used in legacy mode, not on instances
        set((state) => ({
          ...state,
          filePath: null,
          resources: [],
          selectedResource: null,
          hasUnsavedChanges: false,
        }));
      },
    }),
    {
      name: "ryos:resedit",
      version: CURRENT_RESEDIT_STORE_VERSION,
    }
  )
); 