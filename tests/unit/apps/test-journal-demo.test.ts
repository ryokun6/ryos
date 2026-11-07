import { describe, expect, test } from "bun:test";
import {
  activeJournalDayId,
  allFeaturesOn,
  currentJournalPage,
  journalPageIndex,
  journalPages,
  averageMood,
  clampSidebarWidth,
  createInitialJournalState,
  isReminderTime,
  reminderTimeOptions,
  JOURNAL_SIDEBAR_MAX_WIDTH,
  JOURNAL_SIDEBAR_MIN_WIDTH,
  dayHasEntry,
  fragmentsForJournalDay,
  journalCardDayId,
  journalDateUnderTitle,
  journalPageTitle,
  moodForDay,
  normalizeJournalState,
  plainTextFromDoc,
  reduceJournal,
  sampleAverageMood,
  sidebarDates,
} from "../../../src/apps/journal/logic";
import { JOURNAL_DAYS, JOURNAL_FRAGMENTS, journalText } from "../../../src/apps/journal/sampleContent";

function state() {
  return createInitialJournalState();
}

describe("journal demo", () => {
  test("starts as two structures with every feature on", () => {
    const initial = state();
    expect(initial.view).toBe("compare");
    expect(allFeaturesOn(initial.toggles)).toBe(true);
    expect(initial.toggles).not.toHaveProperty("streak");
    expect(JOURNAL_DAYS).toHaveLength(6);
    expect(sampleAverageMood()).toBe(averageMood(JOURNAL_DAYS.map((day) => day.mood)));
  });

  test("turns one feature off without touching the others", () => {
    const next = reduceJournal(state(), { type: "toggleFeature", feature: "reminder" });
    expect(next.toggles.reminder).toBe(false);
    expect(next.toggles.mood).toBe(true);
    expect(next.toggles.date).toBe(true);
    expect(next.view).toBe("compare");
  });

  test("switching layout leaves the feature switches alone", () => {
    const toggled = reduceJournal(state(), { type: "toggleFeature", feature: "reminder" });
    const daily = reduceJournal(toggled, { type: "setView", view: "daily" });
    const compared = reduceJournal(daily, { type: "setView", view: "compare" });
    expect(compared.view).toBe("compare");
    expect(compared.toggles.reminder).toBe(false);
    expect(compared.toggles.mood).toBe(true);
  });

  test("freeform is its own view and reset restores the sample", () => {
    let next = reduceJournal(state(), { type: "setView", view: "freeform" });
    next = reduceJournal(next, { type: "toggleFeature", feature: "mood" });
    next = reduceJournal(next, {
      type: "moveFragment",
      id: "oct30-note",
      position: { x: 12, y: 18 },
    });
    const reset = reduceJournal(next, { type: "reset" });
    expect(reset).toEqual(createInitialJournalState());
  });

  test("rejects a bad reminder time and clamps a dragged scrap", () => {
    const initial = state();
    expect(reduceJournal(initial, { type: "setReminderTime", time: "25:99" })).toBe(initial);
    const times = reminderTimeOptions();
    expect(times).toHaveLength(48);
    expect(times[0]).toBe("00:00");
    expect(times[1]).toBe("00:30");
    expect(times.at(-1)).toBe("23:30");
    expect(times.every(isReminderTime)).toBe(true);
    expect(reminderTimeOptions("21:15")).toContain("21:15");
    expect(reduceJournal(initial, { type: "setReminderTime", time: "09:00" }).reminderTime).toBe(
      "09:00"
    );
    const moved = reduceJournal(initial, {
      type: "moveFragment",
      id: "oct27-note",
      position: { x: -20, y: 140 },
    });
    expect(moved.positions["oct27-note"]).toEqual({ x: 0, y: 100 });
  });

  test("normalizes a saved service-window demo back to the daily journal", () => {
    const normalized = normalizeJournalState({
      view: "counter",
      toggles: { reminder: false },
      decisions: { removeStreak: "accepted" },
      trialPhoto: true,
      servicePhase: "accepted",
      selectedDayId: "not-a-day",
      positions: { "oct30-note": { x: 4, y: 9 }, bad: { x: "no" } },
    });
    expect(normalized.view).toBe("daily");
    expect(normalized.toggles.reminder).toBe(false);
    expect(normalized.toggles).not.toHaveProperty("streak");
    expect(normalized.toggles.mood).toBe(true);
    expect(normalized.selectedDayId).toBe("2026-11-01");
    expect(normalized.positions["oct30-note"]).toEqual({ x: 4, y: 9 });
    expect(normalized.positions.bad).toBeUndefined();
    expect("decisions" in normalized).toBe(false);
  });

  test("sample prose follows Traditional Chinese, then Simplified, then English", () => {
    const text = {
      "zh-TW": "茶館",
      "zh-CN": "茶馆",
      en: "Tea house",
    };
    expect(journalText(text, "zh-TW")).toBe("茶館");
    expect(journalText(text, "zh-Hant-HK")).toBe("茶館");
    expect(journalText(text, "zh-CN")).toBe("茶馆");
    expect(journalText(text, "zh")).toBe("茶馆");
    expect(journalText(text, "en")).toBe("Tea house");
    expect(journalText(text, "fr")).toBe("Tea house");
  });

  test("mood stars and entry text persist until reset restores the sample", () => {
    let next = reduceJournal(state(), {
      type: "setMood",
      dayId: "2026-10-30",
      mood: 2,
    });
    next = reduceJournal(next, { type: "setMood", dayId: "2026-10-30", mood: 9 });
    expect(moodForDay(next, "2026-10-30")).toBe(5);
    next = reduceJournal(next, { type: "setMood", dayId: "2026-10-30", mood: 2 });
    expect(moodForDay(next, "2026-10-30")).toBe(2);
    expect(moodForDay(next, "2026-10-27")).toBe(3);

    const doc = {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text: "改過的一句" }] }],
    };
    next = reduceJournal(next, { type: "setEntryText", id: "oct30-note", doc });
    expect(plainTextFromDoc(next.texts["oct30-note"])).toBe("改過的一句");

    const reset = reduceJournal(next, { type: "reset" });
    expect(reset.texts).toEqual({});
    expect(reset.moods).toEqual({});
    expect(moodForDay(reset, "2026-10-30")).toBe(5);
  });

  test("the date list includes the next week and empty days stay empty until written", () => {
    const dates = sidebarDates("2026-11-02");
    expect(dates[0]).toBe("2026-10-27");
    expect(dates.at(-1)).toBe("2026-11-09");
    expect(dates).toContain("2026-11-02");
    expect(dayHasEntry(state(), "2026-10-30")).toBe(true);
    expect(dayHasEntry(state(), "2026-11-02")).toBe(false);

    const opened = reduceJournal(state(), { type: "selectDay", dayId: "2026-11-05" });
    expect(opened.selectedDayId).toBe("2026-11-05");
    const written = reduceJournal(opened, {
      type: "setEntryText",
      id: "entry:2026-11-05",
      doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "明天" }] }] },
    });
    expect(dayHasEntry(written, "2026-11-05")).toBe(true);
  });

  test("the open day is what the canvas highlights, except a blank undated page", () => {
    const initial = state();
    expect(activeJournalDayId(initial)).toBe(initial.selectedDayId);
    const later = reduceJournal(initial, { type: "selectDay", dayId: "2026-10-30" });
    expect(activeJournalDayId(later)).toBe("2026-10-30");
    const blank = reduceJournal(later, { type: "addUndatedPage", id: "page-1" });
    expect(blank.toggles.date).toBe(true);
    expect(activeJournalDayId(blank)).toBeNull();
    expect(currentJournalPage(blank)).toEqual({ kind: "page", id: "page-1" });
    const undated = reduceJournal(
      reduceJournal(later, { type: "toggleFeature", feature: "date" }),
      { type: "addUndatedPage", id: "page-1" }
    );
    expect(activeJournalDayId(undated)).toBeNull();
  });

  test("a scrap stays on its page and a blank page is the last page", () => {
    const today = "2026-11-07";
    const withNote = reduceJournal(state(), {
      type: "addScrap",
      scrap: {
        id: "note-1",
        pageId: "2026-10-30",
        kind: "text",
        photo: null,
        songId: null,
        songTitle: null,
        songArtist: null,
        canvasPageId: null,
        x: 8,
        y: 8,
        w: 30,
        rotate: -2,
      },
    });
    expect(withNote.scraps).toHaveLength(1);
    expect(dayHasEntry(withNote, "2026-10-30")).toBe(true);
    const withPage = reduceJournal(withNote, { type: "addUndatedPage", id: "page-1" });
    const pages = journalPages(withPage, today);
    expect(pages.at(-1)).toEqual({ kind: "page", id: "page-1" });
    expect(journalPageIndex(withPage, today)).toBe(pages.length - 1);
    const duplicate = reduceJournal(withPage, { type: "addScrap", scrap: withNote.scraps[0] });
    expect(duplicate.scraps).toHaveLength(1);
    expect(normalizeJournalState({ scraps: [{ id: "", kind: "text" }] }).scraps).toEqual([]);
    const song = reduceJournal(state(), {
      type: "addScrap",
      scrap: {
        id: "song-1",
        pageId: "2026-10-30",
        kind: "song",
        photo: null,
        songId: "track-1",
        songTitle: "Alley",
        songArtist: "Ryo",
        canvasPageId: "board",
        x: 8,
        y: 20,
        w: 30,
        rotate: 2,
      },
    });
    expect(song.scraps[0]?.songTitle).toBe("Alley");
  });

  test("canvas pages stay off the date list", () => {
    const initial = state();
    expect(initial.canvasPages).toEqual(["board"]);
    expect(initial.selectedCanvasPageId).toBe("board");
    const next = reduceJournal(initial, { type: "addCanvasPage", id: "board-2" });
    expect(next.canvasPages).toEqual(["board", "board-2"]);
    expect(next.selectedCanvasPageId).toBe("board-2");
    expect(next.selectedDayId).toBe(initial.selectedDayId);
    const back = reduceJournal(next, { type: "selectCanvasPage", id: "board" });
    expect(back.selectedCanvasPageId).toBe("board");
    expect(back.selectedDayId).toBe(initial.selectedDayId);
    expect(normalizeJournalState({}).canvasPages).toEqual(["board"]);
  });

  test("an undated page is added without turning the date list back on", () => {
    const next = reduceJournal(state(), { type: "addUndatedPage", id: "page-1" });
    expect(next.undatedPages).toEqual(["page-1"]);
    expect(next.selectedUndatedId).toBe("page-1");
    expect(next.toggles.date).toBe(true);
    const reset = reduceJournal(next, { type: "reset" });
    expect(reset.undatedPages).toEqual([]);
  });

  test("freeform is its own view and keeps the feature switches", () => {
    const next = reduceJournal(state(), { type: "setView", view: "freeform" });
    expect(next.view).toBe("freeform");
    expect(allFeaturesOn(next.toggles)).toBe(true);
  });

  test("the selected card can be deleted or moved to another day", () => {
    const note = {
      id: "note-1",
      pageId: "2026-10-30",
      kind: "text" as const,
      photo: null,
      songId: null,
      songTitle: null,
      songArtist: null,
      songCover: null,
      canvasPageId: "board",
      x: 8,
      y: 8,
      w: 30,
      rotate: -2,
    };
    const added = reduceJournal(state(), { type: "addScrap", scrap: note });
    expect(added.selectedCardId).toBe("note-1");
    const moved = reduceJournal(added, { type: "moveCard", id: "note-1", dayId: "2026-10-31" });
    expect(moved.scraps[0]?.pageId).toBe("2026-10-31");
    expect(journalCardDayId(moved, "note-1")).toBe("2026-10-31");
    const removed = reduceJournal(moved, { type: "removeCard", id: "note-1" });
    expect(removed.scraps).toEqual([]);
    expect(removed.selectedCardId).toBeNull();

    const sample = JOURNAL_FRAGMENTS[0];
    const hidden = reduceJournal(state(), { type: "removeCard", id: sample.id });
    expect(fragmentsForJournalDay(hidden, sample.dayId).some((fragment) => fragment.id === sample.id)).toBe(
      false
    );
    expect(dayHasEntry(hidden, sample.dayId)).toBe(false);
    const relocated = reduceJournal(state(), { type: "moveCard", id: sample.id, dayId: "2026-11-02" });
    expect(fragmentsForJournalDay(relocated, "2026-11-02").some((fragment) => fragment.id === sample.id)).toBe(
      true
    );
    expect(fragmentsForJournalDay(relocated, sample.dayId).some((fragment) => fragment.id === sample.id)).toBe(
      false
    );
    expect(normalizeJournalState({ selectedCardId: "missing" }).selectedCardId).toBeNull();
  });

  test("a page title falls back to the date until one is saved", () => {
    const initial = state();
    expect(journalPageTitle(initial, initial.selectedDayId, "Nov 1")).toBe("Nov 1");
    const named = reduceJournal(initial, {
      type: "setPageTitle",
      id: initial.selectedDayId,
      title: "  Taipei   notes  ",
    });
    expect(named.pageTitles[initial.selectedDayId]).toBe("Taipei notes");
    expect(journalPageTitle(named, initial.selectedDayId, "Nov 1")).toBe("Taipei notes");
    const cleared = reduceJournal(named, {
      type: "setPageTitle",
      id: initial.selectedDayId,
      title: "   ",
    });
    expect(cleared.pageTitles[initial.selectedDayId]).toBeUndefined();
    expect(normalizeJournalState({ pageTitles: { "2026-11-01": "  Kept  " } }).pageTitles).toEqual({
      "2026-11-01": "Kept",
    });
    expect(journalDateUnderTitle(undefined, "Nov 1")).toBe("");
    expect(journalDateUnderTitle("   ", "Nov 1")).toBe("");
    expect(journalDateUnderTitle("Nov 1", "Nov 1")).toBe("");
    expect(journalDateUnderTitle("Taipei notes", "Nov 1")).toBe("Nov 1");
    expect(journalDateUnderTitle("Taipei notes", "")).toBe("");
  });

  test("sidebar width stays inside the drag limits", () => {
    expect(clampSidebarWidth(undefined)).toBe(148);
    expect(clampSidebarWidth(40)).toBe(JOURNAL_SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(900)).toBe(JOURNAL_SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth(180)).toBe(180);
  });

});
