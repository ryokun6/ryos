import { describe, expect, test } from "bun:test";
import {
  allFeaturesOn,
  averageMood,
  consecutiveDayStreak,
  createInitialJournalState,
  moodForDay,
  normalizeJournalState,
  plainTextFromDoc,
  reduceJournal,
  sampleAverageMood,
  sampleStreak,
} from "../../../src/apps/journal/logic";
import { JOURNAL_DAYS, journalText } from "../../../src/apps/journal/sampleContent";

function state() {
  return createInitialJournalState();
}

describe("journal demo", () => {
  test("starts as the complete daily journal", () => {
    const initial = state();
    expect(initial.view).toBe("daily");
    expect(allFeaturesOn(initial.toggles)).toBe(true);
    expect(sampleStreak()).toBe(6);
    expect(JOURNAL_DAYS).toHaveLength(6);
    expect(sampleAverageMood()).toBe(averageMood(JOURNAL_DAYS.map((day) => day.mood)));
  });

  test("turns one feature off without touching the others", () => {
    const next = reduceJournal(state(), { type: "toggleFeature", feature: "streak" });
    expect(next.toggles.streak).toBe(false);
    expect(next.toggles.reminder).toBe(true);
    expect(next.toggles.mood).toBe(true);
    expect(next.toggles.date).toBe(true);
    expect(next.toggles.weeklyReport).toBe(true);
    expect(next.view).toBe("daily");
  });

  test("two structures is a preset and leaves the feature switches alone", () => {
    const toggled = reduceJournal(state(), { type: "toggleFeature", feature: "streak" });
    const compared = reduceJournal(toggled, { type: "applyPreset", preset: "compare" });
    expect(compared.view).toBe("compare");
    expect(compared.toggles.streak).toBe(false);
    expect(compared.toggles.reminder).toBe(true);
  });

  test("the complete preset restores every feature and the daily pages", () => {
    let next = reduceJournal(state(), { type: "toggleFeature", feature: "mood" });
    next = reduceJournal(next, { type: "setView", view: "freeform" });
    next = reduceJournal(next, { type: "applyPreset", preset: "complete" });
    expect(next.view).toBe("daily");
    expect(allFeaturesOn(next.toggles)).toBe(true);
  });

  test("freeform is its own view and reset restores the sample", () => {
    let next = reduceJournal(state(), { type: "setView", view: "freeform" });
    next = reduceJournal(next, { type: "toggleFeature", feature: "weeklyReport" });
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
      toggles: { streak: false },
      decisions: { removeStreak: "accepted" },
      trialPhoto: true,
      servicePhase: "accepted",
      selectedDayId: "not-a-day",
      positions: { "oct30-note": { x: 4, y: 9 }, bad: { x: "no" } },
    });
    expect(normalized.view).toBe("daily");
    expect(normalized.toggles.streak).toBe(false);
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

  test("streak counts only consecutive sample days", () => {
    expect(consecutiveDayStreak(["2026-10-27", "2026-10-28", "2026-10-30"])).toBe(1);
    expect(consecutiveDayStreak(["2026-10-30", "2026-10-31", "2026-11-01"])).toBe(3);
  });
});
