import { createContext, use } from "react";
import { Editor } from "@tiptap/core";

export const EditorContext = createContext<Editor | null>(null);

export function useEditorContext() {
  const editor = use(EditorContext);
  if (!editor) {
    throw new Error("useEditorContext must be used within EditorProvider");
  }
  return editor;
}
