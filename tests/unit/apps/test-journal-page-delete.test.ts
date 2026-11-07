import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  clearJournalTextEditor,
  deleteFocusedTextBlock,
  deleteJournalSelection,
  registerJournalTextEditor,
} from "../../../src/apps/journal/journalSelectionDelete";
import {
  createInitialJournalState,
  fragmentsForJournalDay,
  reduceJournal,
} from "../../../src/apps/journal/logic";

if (typeof document === "undefined" || !GlobalRegistrator.isRegistered) {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
}

function editorWith(html: string) {
  return new Editor({
    extensions: [StarterKit],
    content: html,
  });
}

describe("journal page delete", () => {
  test("deletes the selected paragraph and leaves the other paragraph", () => {
    const editor = editorWith("<p>Keep</p><p>Drop</p>");
    editor.commands.focus("end");
    registerJournalTextEditor("oct28-note", editor);

    expect(deleteFocusedTextBlock("oct28-note")).toBe(true);
    expect(editor.getText()).toBe("Keep");

    clearJournalTextEditor(editor);
    editor.destroy();
  });

  test("a single text block is the card, and the rest of the page stays", () => {
    const editor = editorWith("<p>Only</p>");
    editor.commands.focus("end");
    registerJournalTextEditor("oct28-note", editor);
    const removed: string[] = [];

    deleteJournalSelection("oct28-note", (id) => removed.push(id));

    expect(removed).toEqual(["oct28-note"]);
    expect(editor.getText()).toBe("Only");
    const page = reduceJournal(createInitialJournalState(), {
      type: "selectDay",
      dayId: "2026-10-28",
    });
    const next = reduceJournal(page, { type: "removeCard", id: "oct28-note" });
    expect(next.selectedDayId).toBe("2026-10-28");
    expect(fragmentsForJournalDay(next, "2026-10-28").map((fragment) => fragment.id)).toEqual([
      "oct28-photo",
    ]);

    clearJournalTextEditor(editor);
    editor.destroy();
  });

  test("a selected photo card is removed without the note", () => {
    const removed: string[] = [];
    deleteJournalSelection("oct28-photo", (id) => removed.push(id));
    expect(removed).toEqual(["oct28-photo"]);
  });
});
