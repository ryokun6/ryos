import { afterAll, describe, expect, test } from "bun:test";
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
import { installHappyDom, uninstallHappyDom } from "../../helpers/register-happy-dom";

const installedHappyDom = installHappyDom();

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
    registerJournalTextEditor("big-boy-note", editor);

    expect(deleteFocusedTextBlock("big-boy-note")).toBe(true);
    expect(editor.getText()).toBe("Keep");

    clearJournalTextEditor(editor);
    editor.destroy();
  });

  test("a single text block is the card, and the rest of the page stays", () => {
    const editor = editorWith("<p>Only</p>");
    editor.commands.focus("end");
    registerJournalTextEditor("big-boy-note", editor);
    const removed: string[] = [];

    deleteJournalSelection("big-boy-note", (id) => removed.push(id));

    expect(removed).toEqual(["big-boy-note"]);
    expect(editor.getText()).toBe("Only");
    const page = reduceJournal(createInitialJournalState(), {
      type: "selectDay",
      dayId: "2026-10-30",
    });
    const next = reduceJournal(page, { type: "removeCard", id: "big-boy-note" });
    expect(next.selectedDayId).toBe("2026-10-30");
    expect(fragmentsForJournalDay(next, "2026-10-30").map((fragment) => fragment.id)).toEqual([
      "big-boy-photo",
    ]);

    clearJournalTextEditor(editor);
    editor.destroy();
  });

  test("a selected photo card is removed without the note", () => {
    const removed: string[] = [];
    deleteJournalSelection("big-boy-photo", (id) => removed.push(id));
    expect(removed).toEqual(["big-boy-photo"]);
  });
});

afterAll(async () => {
  await uninstallHappyDom(installedHappyDom);
});
