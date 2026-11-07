import { useEffect, useMemo } from "react";
import type { JSONContent } from "@tiptap/core";
import { useTranslation } from "react-i18next";
import { EditorProvider } from "@/apps/textedit/components/EditorProvider";
import { useEditorContext } from "@/apps/textedit/components/EditorContext";
import { TextEditor } from "@/apps/textedit/components/TextEditor";
import {
  clearJournalTextEditor,
  registerJournalTextEditor,
} from "../journalSelectionDelete";
import { plainTextFromDoc } from "../logic";
import {
  journalText,
  sampleDoc,
  type JournalFragment,
} from "../sampleContent";
import type { JournalDoc } from "../types";

const JOURNAL_EDITOR_CLASS =
  "textedit-prosemirror-root prose prose-sm prose-textedit max-w-none bg-transparent font-os-ui text-base leading-relaxed focus:outline-none min-h-[3rem] [&>p]:my-1";

function JournalTextSelectionBridge({
  id,
  onSelect,
}: {
  id: string;
  onSelect?: (id: string) => void;
}) {
  const editor = useEditorContext();
  useEffect(() => {
    if (!editor) return;
    const mark = () => registerJournalTextEditor(id, editor);
    const focus = () => {
      mark();
      onSelect?.(id);
    };
    editor.on("focus", focus);
    editor.on("selectionUpdate", mark);
    return () => {
      editor.off("focus", focus);
      editor.off("selectionUpdate", mark);
      clearJournalTextEditor(editor);
    };
  }, [editor, id, onSelect]);
  return null;
}

export function JournalEntryEditor({
  fragment,
  saved,
  language,
  onChange,
  onSelect,
}: {
  fragment: JournalFragment;
  saved: JournalDoc | undefined;
  language: string;
  onChange: (id: string, doc: JournalDoc) => void;
  onSelect?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const content = useMemo(
    () => saved ?? sampleDoc(fragment.text ? journalText(fragment.text, language) : ""),
    [saved, fragment, language]
  );
  const empty = plainTextFromDoc(content).length === 0;

  return (
    <div className="relative">
      {empty ? (
        <span
          data-journal-placeholder=""
          className="pointer-events-none absolute left-0 top-1 text-base leading-relaxed text-os-text-secondary"
        >
          {t("apps.journal.toolbar.write")}
        </span>
      ) : null}
      <EditorProvider
        content={content as JSONContent}
        editorClassName={JOURNAL_EDITOR_CLASS}
        onUpdate={(json) => onChange(fragment.id, json as JournalDoc)}
      >
        <JournalTextSelectionBridge id={fragment.id} onSelect={onSelect} />
        <TextEditor className="w-full min-h-0 bg-transparent text-os-text-primary" />
      </EditorProvider>
    </div>
  );
}
