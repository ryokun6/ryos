import type { Editor } from "@tiptap/core";

type ActiveJournalText = {
  id: string;
  editor: Editor;
};

let activeJournalText: ActiveJournalText | null = null;

export function registerJournalTextEditor(id: string, editor: Editor) {
  activeJournalText = { id, editor };
}

export function clearJournalTextEditor(editor: Editor) {
  if (activeJournalText?.editor === editor) activeJournalText = null;
}

/** Deletes the paragraph that holds the caret when the note has more than one. */
export function deleteFocusedTextBlock(id: string): boolean {
  const active = activeJournalText;
  if (!active || active.id !== id || active.editor.isDestroyed) return false;
  const editor = active.editor;
  const doc = editor.state.doc;
  if (doc.childCount <= 1) return false;
  const $from = editor.state.selection.$from;
  if ($from.depth < 1) return false;
  const from = $from.before(1);
  const to = $from.after(1);
  return editor.chain().focus().deleteRange({ from, to }).run();
}

/** Removes the selected text block, or the selected card. The page stays. */
export function deleteJournalSelection(
  id: string | null,
  removeCard: (id: string) => void
) {
  if (!id) return;
  if (deleteFocusedTextBlock(id)) return;
  removeCard(id);
}
