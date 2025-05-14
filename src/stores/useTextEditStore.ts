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

export interface TextEditStoreState {
  /** The absolute path of the currently open file, or null if the document is untitled. */
  lastFilePath: string | null;
  /** Raw ProseMirror JSON content for crash-recovery / hand-off to other apps. */
  contentJson: JSONContent | null;
  /** Whether the in-memory document has edits that have not been saved to disk yet. */
  hasUnsavedChanges: boolean;
  // actions
  setLastFilePath: (path: string | null) => void;
  setContentJson: (json: JSONContent | null) => void;
  setHasUnsavedChanges: (val: boolean) => void;
  /** Clear the store back to its initial state. */
  reset: () => void;
  /** Apply an external update to the document (e.g. Chat GPT tool calls). */
  applyExternalUpdate: (json: JSONContent) => void;
  /**
   * Append (or prepend) a simple paragraph node containing plain text.
   * This helper is primarily used by AI tool calls so they can modify the
   * document without needing direct access to the TipTap editor instance.
   */
  insertText: (text: string, position?: "start" | "end") => void;
}

const CURRENT_TEXTEDIT_STORE_VERSION = 1;

export const useTextEditStore = create<TextEditStoreState>()(
  persist(
    (set) => ({
      lastFilePath: null,
      contentJson: null,
      hasUnsavedChanges: false,
      setLastFilePath: (path) => set({ lastFilePath: path }),
      setContentJson: (json) => set({ contentJson: json }),
      setHasUnsavedChanges: (val) => set({ hasUnsavedChanges: val }),
      /**
       * Append (or prepend) a simple paragraph node containing plain text.
       * This helper is primarily used by AI tool calls so they can modify the
       * document without needing direct access to the TipTap editor instance.
       */
      insertText: (text: string, position: "start" | "end" = "end") =>
        set((state) => {
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

          if (state.contentJson && Array.isArray(state.contentJson.content)) {
            // Clone existing document JSON to avoid direct mutation
            const cloned = JSON.parse(JSON.stringify(state.contentJson));
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

          return {
            contentJson: newDocJson,
            hasUnsavedChanges: true,
          } as Partial<TextEditStoreState>;
        }),
      reset: () =>
        set({
          lastFilePath: null,
          contentJson: null,
          hasUnsavedChanges: false,
        }),
      applyExternalUpdate: (json) =>
        set({
          contentJson: json,
          hasUnsavedChanges: true,
        }),
    }),
    {
      name: "ryos:textedit",
      version: CURRENT_TEXTEDIT_STORE_VERSION,
      migrate: (persistedState, version) => {
        // If no persisted state (first load) try to migrate from old localStorage keys
        if (!persistedState || version < CURRENT_TEXTEDIT_STORE_VERSION) {
          try {
            const lastFilePath = localStorage.getItem(
              "textedit:last-file-path"
            );
            const rawJson = localStorage.getItem("textedit:content");
            const migratedState: TextEditStoreState = {
              lastFilePath: lastFilePath ?? null,
              contentJson: rawJson
                ? (JSON.parse(rawJson) as JSONContent)
                : null,
              hasUnsavedChanges: false,
              setLastFilePath: () => {},
              setContentJson: () => {},
              setHasUnsavedChanges: () => {},
              reset: () => {},
              applyExternalUpdate: () => {},
              insertText: () => {},
            };

            // Clean up old keys once migrated
            if (lastFilePath || rawJson) {
              localStorage.removeItem("textedit:last-file-path");
              localStorage.removeItem("textedit:content");
            }

            return migratedState;
          } catch (e) {
            console.warn("TextEditStore migration failed", e);
          }
        }
        return persistedState as TextEditStoreState;
      },
      partialize: (state) => ({
        lastFilePath: state.lastFilePath,
        contentJson: state.contentJson,
        hasUnsavedChanges: state.hasUnsavedChanges,
      }),
    }
  )
);
