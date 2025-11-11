import { create } from "zustand";
import { persist } from "zustand/middleware";
import { markdownToHtml } from "@/utils/markdown";
import { generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { JSONContent, AnyExtension } from "@tiptap/core";
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

  // Legacy single-window support (deprecated, kept for migration)
  lastFilePath: string | null;
  contentJson: JSONContent | null;
  hasUnsavedChanges: boolean;

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

  // Legacy actions (now operate on foreground instance)
  setLastFilePath: (path: string | null) => void;
  setContentJson: (json: JSONContent | null) => void;
  setHasUnsavedChanges: (val: boolean) => void;
  reset: () => void;
  applyExternalUpdate: (json: JSONContent) => void;
  insertText: (text: string, position?: "start" | "end") => void;
}

const CURRENT_TEXTEDIT_STORE_VERSION = 2;

export const useTextEditStore = create<TextEditStoreState>()(
  persist(
    (set, get) => ({
      // Instance state
      instances: {},

      // Legacy state (deprecated)
      lastFilePath: null,
      contentJson: null,
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

      // Legacy actions - kept for backward compatibility but should not be used with instances
      setLastFilePath: (path) => {
        // Only operate on legacy store, not on instances
        set((state) => ({ ...state, lastFilePath: path }));
      },

      setContentJson: (json) => {
        // Only operate on legacy store, not on instances
        set((state) => ({ ...state, contentJson: json }));
      },

      setHasUnsavedChanges: (val) => {
        // Only operate on legacy store, not on instances
        set((state) => ({ ...state, hasUnsavedChanges: val }));
      },

      insertText: (text: string, position: "start" | "end" = "end") => {
        // This method should only be used in legacy mode, not with instances
        const legacyContentJson = get().contentJson;

        // Step 1: Convert incoming markdown snippet to HTML
        const htmlFragment = markdownToHtml(text);

        // Step 2: Generate TipTap-compatible JSON from the HTML fragment
        const parsedJson = generateJSON(htmlFragment, [
          StarterKit,
          Underline,
          TextAlign.configure({ types: ["heading", "paragraph"] }),
          TaskList,
          TaskItem.configure({ nested: true }),
        ] as AnyExtension[]);

        // parsedJson is a full doc – we want just its content array
        const nodesToInsert = Array.isArray(parsedJson.content)
          ? parsedJson.content
          : [];

        let newDocJson: JSONContent;

        if (legacyContentJson && Array.isArray(legacyContentJson.content)) {
          // Clone existing document JSON to avoid direct mutation
          const cloned = JSON.parse(JSON.stringify(legacyContentJson));
          if (position === "start") {
            cloned.content = [...nodesToInsert, ...cloned.content];
          } else {
            cloned.content = [...cloned.content, ...nodesToInsert];
          }
          newDocJson = cloned;
        } else {
          // No existing document – use the parsed JSON directly
          newDocJson = parsedJson;
        }

        set((state) => ({
          ...state,
          contentJson: newDocJson,
          hasUnsavedChanges: true,
        }));
      },

      reset: () => {
        // This method should only be used in legacy mode, not with instances
        set((state) => ({
          ...state,
          lastFilePath: null,
          contentJson: null,
          hasUnsavedChanges: false,
        }));
      },

      applyExternalUpdate: (json) => {
        // This method should only be used in legacy mode, not with instances
        set((state) => ({
          ...state,
          contentJson: json,
          hasUnsavedChanges: true,
        }));
      },

      migrate: (persistedState: unknown, version: number) => {
        // Migrate from v1 to v2 (single window to multi-instance)
        if (version < 2) {
          const oldState = persistedState as {
            lastFilePath?: string | null;
            contentJson?: JSONContent | null;
            hasUnsavedChanges?: boolean;
          };

          // Create new state with instances
          const migratedState: Partial<TextEditStoreState> = {
            instances: {},
            // Keep legacy fields for backward compatibility
            lastFilePath: oldState.lastFilePath || null,
            contentJson: oldState.contentJson || null,
            hasUnsavedChanges: oldState.hasUnsavedChanges || false,
          };

          return migratedState;
        }

        return persistedState;
      },
    }),
    {
      name: "zios:textedit",
      version: CURRENT_TEXTEDIT_STORE_VERSION,
      migrate: (persistedState: unknown, version: number) => {
        // Migrate from v1 to v2 (single window to multi-instance)
        if (version < 2) {
          const oldState = persistedState as {
            lastFilePath?: string | null;
            contentJson?: JSONContent | null;
            hasUnsavedChanges?: boolean;
          };

          // Create new state with instances
          const migratedState: Partial<TextEditStoreState> = {
            instances: {},
            // Keep legacy fields for backward compatibility
            lastFilePath: oldState.lastFilePath || null,
            contentJson: oldState.contentJson || null,
            hasUnsavedChanges: oldState.hasUnsavedChanges || false,
          };

          return migratedState;
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
        // Don't persist legacy fields
      }),
    }
  )
);
