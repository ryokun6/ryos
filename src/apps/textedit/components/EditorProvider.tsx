import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { SlashCommands } from "../extensions/SlashCommands";
import { SpeechHighlight } from "../extensions/SpeechHighlight";
import { EditorContext } from "./EditorContext";

interface EditorProviderProps {
  children?: React.ReactNode;
}

export function EditorProvider({ children }: EditorProviderProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      SlashCommands,
      SpeechHighlight,
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm prose-neutral max-w-none focus:outline-none p-4 [&>ul]:list-disc [&>ol]:list-decimal [&>*]:my-1 [&>p]:leading-5 [&>h1]:mt-3 [&>h1]:mb-2 [&>h2]:mt-2 [&>h2]:mb-1 [&>ul]:my-1 [&>ol]:my-1 [&>ul>li]:my-0.5 [&>ol>li]:my-0.5 [&>ul]:pl-0 [&>ol]:pl-4 [&>ul>li>p]:my-0 [&>ol>li>p]:my-0 [&>ul>li]:pl-0 [&>ol>li]:pl-0 [&>ul>li]:marker:text-neutral-900 [&>ol>li]:marker:text-neutral-900 [&>ul[data-type='taskList']]:ml-0 [&>ul[data-type='taskList']]:list-none [&>ul[data-type='taskList']>li]:flex [&>ul[data-type='taskList']>li]:items-start [&>ul[data-type='taskList']>li>label]:mr-2 [&>ul[data-type='taskList']>li>label>input]:mt-1 [&>ul[data-type='taskList']>li>div]:flex-1 [&>ul[data-type='taskList']>li>div>p]:my-0 [&>ul>li>ul]:pl-1 [&>ol>li>ol]:pl-1 [&>ul>li>ol]:pl-1 [&>ol>li>ul]:pl-1 [&>ul>li>ul]:my-0 [&>ol>li>ol]:my-0 [&>ul>li>ul>li>p]:my-0 min-h-full font-geneva-12 text-[12px] [&>h1]:text-[24px] [&>h2]:text-[20px] [&>h3]:text-[16px] [&>h1]:font-['ChicagoKare'] [&>h2]:font-['ChicagoKare'] [&>h3]:font-['ChicagoKare']",
      },
    },
  });

  return (
    <EditorContext.Provider value={editor}>
      {children}
    </EditorContext.Provider>
  );
}