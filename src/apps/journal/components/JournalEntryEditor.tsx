import { useMemo } from "react";
import type { JSONContent } from "@tiptap/core";
import { EditorProvider } from "@/apps/textedit/components/EditorProvider";
import { TextEditor } from "@/apps/textedit/components/TextEditor";
import {
  journalText,
  sampleDoc,
  type JournalFragment,
} from "../sampleContent";
import type { JournalDoc } from "../types";

const JOURNAL_EDITOR_CLASS =
  "textedit-prosemirror-root prose prose-sm prose-textedit max-w-none bg-transparent font-os-ui text-base leading-relaxed focus:outline-none min-h-[3rem] [&>p]:my-1";

export function JournalEntryEditor({
  fragment,
  saved,
  language,
  onChange,
}: {
  fragment: JournalFragment;
  saved: JournalDoc | undefined;
  language: string;
  onChange: (id: string, doc: JournalDoc) => void;
}) {
  const content = useMemo(
    () => saved ?? sampleDoc(fragment.text ? journalText(fragment.text, language) : ""),
    [saved, fragment, language]
  );

  return (
    <EditorProvider
      content={content as JSONContent}
      editorClassName={JOURNAL_EDITOR_CLASS}
      onUpdate={(json) => onChange(fragment.id, json as JournalDoc)}
    >
      <TextEditor className="w-full min-h-0 bg-transparent text-os-text-primary" />
    </EditorProvider>
  );
}
