import { describe, expect, test } from "bun:test";
import {
  averageMood,
  buildPlanDiff,
  consecutiveDayStreak,
  createInitialJournalState,
  normalizeJournalState,
  reduceJournal,
  sampleAverageMood,
  sampleStreak,
  servicePicture,
  SERVICE_PICTURE,
  visibleJournal,
} from "../../../src/apps/journal/logic";
import { JOURNAL_DAYS } from "../../../src/apps/journal/sampleContent";
import { journalText } from "../../../src/apps/journal/sampleContent";

function state() {
  return createInitialJournalState();
}

describe("journal demo", () => {
  test("starts as the complete answer", () => {
    const initial = state();
    const visible = visibleJournal(initial);
    expect(visible.features).toEqual({
      date: true,
      mood: true,
      streak: true,
      reminder: true,
      weeklyReport: true,
    });
    expect(visible.structure).toBe("dailyPages");
    expect(visible.trialPhoto).toBe(false);
    expect(initial.decisions).toEqual({
      removeStreak: "pending",
      disableReminder: "pending",
      switchToFreeform: "pending",
    });
    expect(sampleStreak()).toBe(6);
    expect(JOURNAL_DAYS).toHaveLength(6);
    expect(sampleAverageMood()).toBe(averageMood(JOURNAL_DAYS.map((day) => day.mood)));
  });

  test("turns one feature off without touching the others", () => {
    const next = reduceJournal(state(), { type: "toggleFeature", feature: "streak" });
    const visible = visibleJournal(next);
    expect(visible.features.streak).toBe(false);
    expect(visible.features.reminder).toBe(true);
    expect(visible.features.mood).toBe(true);
    expect(visible.features.date).toBe(true);
    expect(visible.features.weeklyReport).toBe(true);
    expect(next.decisions.removeStreak).toBe("pending");
    expect(next.baselineToggles.streak).toBe(false);
  });

  test("keeps the reminder and removes the streak as separate plan edits", () => {
    let next = reduceJournal(state(), {
      type: "setDecision",
      edit: "removeStreak",
      decision: "accepted",
    });
    next = reduceJournal(next, {
      type: "setDecision",
      edit: "disableReminder",
      decision: "rejected",
    });
    const visible = visibleJournal(next);
    expect(visible.features.streak).toBe(false);
    expect(visible.features.reminder).toBe(true);
    expect(visible.structure).toBe("dailyPages");

    const diff = buildPlanDiff(next.decisions, next.trialPhoto);
    expect(diff.before.streak).toBe(true);
    expect(diff.before.reminder).toBe(true);
    expect(diff.before.structure).toBe("dailyPages");
    expect(diff.after.streak).toBe(false);
    expect(diff.after.reminder).toBe(true);
    expect(diff.after.structure).toBe("dailyPages");
    expect(diff.after.mood).toBe(true);
    expect(diff.after.trialPhoto).toBe(false);
  });

  test("switches the plan to freeform scraps without dropping the daily sample", () => {
    const next = reduceJournal(state(), {
      type: "setDecision",
      edit: "switchToFreeform",
      decision: "accepted",
    });
    expect(visibleJournal(next).structure).toBe("freeform");
    expect(JOURNAL_DAYS.length).toBeGreaterThan(1);
    expect(buildPlanDiff(next.decisions, false).after.structure).toBe("freeform");
    expect(buildPlanDiff(next.decisions, false).after.streak).toBe(true);
  });

  test("adds a trial photo to the after picture and undoes it", () => {
    const added = reduceJournal(state(), { type: "addTrialPhoto" });
    expect(added.trialPhoto).toBe(true);
    expect(buildPlanDiff(added.decisions, added.trialPhoto).after.trialPhoto).toBe(true);
    expect(buildPlanDiff(added.decisions, added.trialPhoto).before.trialPhoto).toBe(false);

    const undone = reduceJournal(added, { type: "undo" });
    expect(undone.trialPhoto).toBe(false);
    expect(undone.past).toHaveLength(0);
  });

  test("reverts the plan and keeps a direct feature switch", () => {
    let next = reduceJournal(state(), { type: "toggleFeature", feature: "streak" });
    next = reduceJournal(next, {
      type: "setDecision",
      edit: "disableReminder",
      decision: "accepted",
    });
    next = reduceJournal(next, { type: "addTrialPhoto" });
    next = reduceJournal(next, {
      type: "setDecision",
      edit: "switchToFreeform",
      decision: "accepted",
    });

    const reverted = reduceJournal(next, { type: "revertPlan" });
    const visible = visibleJournal(reverted);
    expect(visible.features.streak).toBe(false);
    expect(visible.features.reminder).toBe(true);
    expect(visible.structure).toBe("dailyPages");
    expect(visible.trialPhoto).toBe(false);
    expect(reverted.decisions.disableReminder).toBe("pending");
    expect(reverted.decisions.switchToFreeform).toBe("pending");
  });

  test("service window acceptance does not change the journal", () => {
    const next = reduceJournal(state(), { type: "serviceAccept" });
    expect(next.servicePhase).toBe("accepted");
    expect(visibleJournal(next).features).toEqual(visibleJournal(state()).features);
    expect(next.decisions.removeStreak).toBe("pending");
    expect(servicePicture("accepted")).toEqual(SERVICE_PICTURE);
    expect(servicePicture("rejected").streak).toBe(true);
    expect(servicePicture("rejected").reminder).toBe(true);
    expect(servicePicture("delivered").reminder).toBe(false);
  });

  test("asking again counts another identical result", () => {
    const next = reduceJournal(state(), { type: "serviceAskAgain" });
    expect(next.servicePhase).toBe("askedAgain");
    expect(next.serviceAsks).toBe(1);
    expect(servicePicture(next.servicePhase).structure).toBe("freeform");
  });

  test("undo of an empty history is a no-op and reset restores the sample", () => {
    const initial = state();
    expect(reduceJournal(initial, { type: "undo" })).toBe(initial);

    let next = reduceJournal(initial, { type: "toggleFeature", feature: "mood" });
    next = reduceJournal(next, { type: "setView", view: "compare" });
    next = reduceJournal(next, {
      type: "moveFragment",
      id: "oct30-note",
      position: { x: 12, y: 18 },
    });
    const reset = reduceJournal(next, { type: "reset" });
    expect(reset).toEqual(createInitialJournalState());
  });

  test("pressing the same plan choice again returns it to pending via clear", () => {
    const accepted = reduceJournal(state(), {
      type: "setDecision",
      edit: "removeStreak",
      decision: "accepted",
    });
    const cleared = reduceJournal(accepted, { type: "clearDecision", edit: "removeStreak" });
    expect(cleared.decisions.removeStreak).toBe("pending");
    expect(visibleJournal(cleared).features.streak).toBe(true);
  });

  test("a direct switch clears a settled plan edit", () => {
    const accepted = reduceJournal(state(), {
      type: "setDecision",
      edit: "removeStreak",
      decision: "accepted",
    });
    const toggled = reduceJournal(accepted, { type: "toggleFeature", feature: "streak" });
    expect(toggled.decisions.removeStreak).toBe("pending");
    expect(visibleJournal(toggled).features.streak).toBe(true);
    expect(toggled.baselineToggles.streak).toBe(true);
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
    expect(moved.past).toHaveLength(0);
  });

  test("normalizes a partial saved demo", () => {
    const normalized = normalizeJournalState({
      view: "compare",
      toggles: { streak: false },
      decisions: { removeStreak: "accepted", disableReminder: "nope" },
      selectedDayId: "not-a-day",
      positions: { "oct30-note": { x: 4, y: 9 }, bad: { x: "no" } },
      past: [{ trialPhoto: true }],
    });
    expect(normalized.view).toBe("compare");
    expect(normalized.toggles.streak).toBe(false);
    expect(normalized.toggles.mood).toBe(true);
    expect(normalized.decisions.removeStreak).toBe("accepted");
    expect(normalized.decisions.disableReminder).toBe("pending");
    expect(normalized.selectedDayId).toBe("2026-11-01");
    expect(normalized.positions["oct30-note"]).toEqual({ x: 4, y: 9 });
    expect(normalized.positions.bad).toBeUndefined();
    expect(normalized.past[0].trialPhoto).toBe(true);
    expect(normalized.past[0].toggles.date).toBe(true);
  });

  test("sample prose follows Traditional Chinese, then Simplified, then English", () => {
    const text = JOURNAL_DAYS.length
      ? {
          "zh-TW": "茶館",
          "zh-CN": "茶馆",
          en: "Tea house",
        }
      : { "zh-TW": "", "zh-CN": "", en: "" };
    expect(journalText(text, "zh-TW")).toBe("茶館");
    expect(journalText(text, "zh-Hant-HK")).toBe("茶館");
    expect(journalText(text, "zh-CN")).toBe("茶馆");
    expect(journalText(text, "zh")).toBe("茶馆");
    expect(journalText(text, "en")).toBe("Tea house");
    expect(journalText(text, "fr")).toBe("Tea house");
  });

  test("streak counts only consecutive sample days", () => {
    expect(consecutiveDayStreak(["2026-10-27", "2026-10-28", "2026-10-30"])).toBe(1);
    expect(consecutiveDayStreak(["2026-10-30", "2026-10-31", "2026-11-01"])).toBe(3);
  });
});
