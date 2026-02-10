import { EditorContent } from "@tiptap/react";
import { useEditorContext } from "./EditorContext";

interface TextEditorProps {
  className?: string;
}

export function TextEditor({ className }: TextEditorProps) {
  const editor = useEditorContext();
  
  return (
    <EditorContent
      editor={editor}
      className={className || "flex-1 overflow-y-auto w-full min-h-0 bg-white"}
    />
  );
}