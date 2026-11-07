import { useEffect, useRef } from "react";
import { useEditor } from "@tiptap/react";
import type { Content, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import "../textedit.css";
import { MarkdownPaste } from "../extensions/MarkdownPaste";
import { SlashCommands } from "../extensions/SlashCommands";
import { SpeechHighlight } from "../extensions/SpeechHighlight";
import { EditorContext } from "./EditorContext";

const TEXT_EDIT_EDITOR_CLASS =
  "textedit-prosemirror-root prose prose-sm prose-textedit max-w-none focus:outline-none p-4 [&>ul]:list-disc [&>ol]:list-decimal [&>*]:my-1 [&>p]:leading-5 [&>h1]:mt-3 [&>h1]:mb-2 [&>h2]:mt-2 [&>h2]:mb-1 [&>ul]:my-1 [&>ol]:my-1 [&>ul>li]:my-0.5 [&>ol>li]:my-0.5 [&>ul]:pl-0 [&>ol]:pl-4 [&>ul>li>p]:my-0 [&>ol>li>p]:my-0 [&>ul>li]:pl-0 [&>ol>li]:pl-0 [&>ul[data-type='taskList']]:ml-0 [&>ul[data-type='taskList']]:list-none [&>ul[data-type='taskList']>li]:flex [&>ul[data-type='taskList']>li]:items-start [&>ul[data-type='taskList']>li>label]:mr-2 [&>ul[data-type='taskList']>li>label>input]:mt-1 [&>ul[data-type='taskList']>li>div]:flex-1 [&>ul[data-type='taskList']>li>div>p]:my-0 [&>ul>li>ul]:pl-1 [&>ol>li>ol]:pl-1 [&>ul>li>ol]:pl-1 [&>ol>li>ul]:pl-1 [&>ul>li>ul]:my-0 [&>ol>li>ol]:my-0 [&>ul>li>ul>li>p]:my-0 min-h-full font-geneva-12 [&>h1]:text-[24px] [&>h2]:text-[20px] [&>h3]:text-[16px] [&>h1]:font-os-ui [&>h2]:font-os-ui [&>h3]:font-os-ui [&>ul[data-type='taskList']>li>label>input]:accent-[var(--os-color-selection-bg)]";

/** TipTap extensions shared by TextEdit and any surface that edits the same documents. */
export function createTextEditExtensions() {
  return [
    // StarterKit v3 bundles Link and Underline.
    StarterKit.configure({
      link: {
        // Clicking a link opens it in a new tab (classic TextEdit behavior);
        // caret placement inside the link text still works via arrow keys.
        openOnClick: true,
      },
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Table.configure({
      resizable: false,
    }),
    TableRow,
    TableHeader,
    TableCell,
    MarkdownPaste,
    SlashCommands,
    SpeechHighlight,
  ];
}

interface EditorProviderProps {
  children?: React.ReactNode;
  /** Initial document. Later changes apply only while the editor is not focused. */
  content?: Content;
  onUpdate?: (json: JSONContent) => void;
  editable?: boolean;
  /** Replaces the TextEdit document class when embedding the editor elsewhere. */
  editorClassName?: string;
}

export function EditorProvider({
  children,
  content = "",
  onUpdate,
  editable = true,
  editorClassName,
}: EditorProviderProps) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const contentRef = useRef(content);
  contentRef.current = content;
  const editor = useEditor({
    extensions: createTextEditExtensions(),
    content,
    editable,
    onUpdate: ({ editor: current }) => {
      onUpdateRef.current?.(current.getJSON());
    },
    editorProps: {
      attributes: {
        class: editorClassName ?? TEXT_EDIT_EDITOR_CLASS,
        style: "font-size: var(--os-typography-editor-body, 12px)",
      },
    },
  });

  const serialized = JSON.stringify(content ?? "");
  const appliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    if (appliedRef.current === null) {
      appliedRef.current = serialized;
      return;
    }
    if (appliedRef.current === serialized || editor.isFocused) return;
    appliedRef.current = serialized;
    editor.commands.setContent(contentRef.current ?? "", { emitUpdate: false });
  }, [editor, serialized]);

  return (
    <EditorContext.Provider value={editor}>
      {editor ? children : null}
    </EditorContext.Provider>
  );
}