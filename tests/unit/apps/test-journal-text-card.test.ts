import { describe, expect, test } from "bun:test";
import {
  canvasTextCard,
  createInitialJournalState,
  entryDocId,
} from "../../../src/apps/journal/logic";
import { sampleDoc } from "../../../src/apps/journal/sampleContent";
import type { JournalScrap } from "../../../src/apps/journal/types";

function emptyScrap(id: string, pageId: string, canvasPageId: string | null): JournalScrap {
  return {
    id,
    pageId,
    kind: "text",
    photo: null,
    songId: null,
    songTitle: null,
    songArtist: null,
    songCover: null,
    canvasPageId,
    x: 8,
    y: 8,
    w: 30,
    rotate: 0,
  };
}

describe("canvas text cards", () => {
  test("adopts the blank entry on a day with no note", () => {
    const state = createInitialJournalState();
    expect(canvasTextCard(state, "2026-11-07", state.canvasPages[0])).toEqual({
      type: "adopt",
      id: entryDocId("2026-11-07"),
    });
  });

  test("selects an empty text scrap instead of creating one", () => {
    const state = createInitialJournalState();
    state.scraps = [emptyScrap("empty-note", "2026-10-30", "board")];
    expect(canvasTextCard(state, "2026-10-30", "board")).toEqual({
      type: "select",
      id: "empty-note",
      boardId: "board",
    });
  });

  test("selects a sample note the writer cleared", () => {
    const state = createInitialJournalState();
    state.texts = { "oct30-note": sampleDoc("") };
    expect(canvasTextCard(state, "2026-10-30", "board")).toEqual({
      type: "select",
      id: "oct30-note",
      boardId: "board",
    });
  });

  test("creates a card when the day's notes already have text", () => {
    const state = createInitialJournalState();
    expect(canvasTextCard(state, "2026-10-30", "board")).toEqual({ type: "create" });
  });
});
