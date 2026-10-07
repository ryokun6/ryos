#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  DAY_MS,
  SRS_DEFAULT_EASE,
  SRS_MIN_EASE,
  SRS_RELEARN_DELAY_MS,
  buildStudyQueue,
  formatSrsInterval,
  createSrsCard,
  isCardDue,
  isNewCard,
  nextEase,
  previewSrsIntervals,
  reviewSrsCard,
  sanitizeSrsCard,
  type SrsCardState,
} from "../../../src/apps/dictionary/utils/srs";

const T0 = Date.UTC(2026, 0, 1);

describe("SM-2 ease factor", () => {
  test("follows the SM-2 formula per quality", () => {
    expect(nextEase(2.5, 5)).toBe(2.6);
    expect(nextEase(2.5, 4)).toBe(2.5);
    expect(nextEase(2.5, 3)).toBe(2.36);
  });

  test("never drops below the minimum", () => {
    let ease = SRS_DEFAULT_EASE;
    for (let i = 0; i < 20; i++) ease = nextEase(ease, 3);
    expect(ease).toBe(SRS_MIN_EASE);
  });
});

describe("reviewSrsCard", () => {
  test("new cards start due immediately and unstudied", () => {
    const card = createSrsCard(T0);
    expect(card).toEqual({ ease: 2.5, interval: 0, repetitions: 0, lapses: 0, dueAt: T0 });
    expect(isNewCard(card)).toBe(true);
    expect(isCardDue(card, T0)).toBe(true);
  });

  test("successful reviews grow the interval 1 → 6 → interval × ease", () => {
    let card = createSrsCard(T0);
    card = reviewSrsCard(card, "good", T0);
    expect(card).toMatchObject({ interval: 1, repetitions: 1, ease: 2.5, dueAt: T0 + DAY_MS });
    expect(isNewCard(card)).toBe(false);

    const t1 = card.dueAt;
    card = reviewSrsCard(card, "good", t1);
    expect(card).toMatchObject({ interval: 6, repetitions: 2, dueAt: t1 + 6 * DAY_MS });

    const t2 = card.dueAt;
    card = reviewSrsCard(card, "good", t2);
    expect(card).toMatchObject({ interval: 15, repetitions: 3, dueAt: t2 + 15 * DAY_MS });
  });

  test("easy raises the ease factor and hard lowers it", () => {
    const base = reviewSrsCard(reviewSrsCard(createSrsCard(T0), "good", T0), "good", T0);
    const easy = reviewSrsCard(base, "easy", T0);
    const hard = reviewSrsCard(base, "hard", T0);
    expect(easy.ease).toBe(2.6);
    expect(easy.interval).toBe(Math.round(6 * 2.6));
    expect(hard.ease).toBe(2.36);
    expect(hard.interval).toBe(Math.round(6 * 2.36));
  });

  test("again resets repetitions, counts a lapse, and requeues soon", () => {
    const learned = reviewSrsCard(reviewSrsCard(createSrsCard(T0), "good", T0), "good", T0);
    const failed = reviewSrsCard(learned, "again", T0);
    expect(failed).toMatchObject({
      repetitions: 0,
      interval: 0,
      lapses: 1,
      ease: learned.ease,
      dueAt: T0 + SRS_RELEARN_DELAY_MS,
      lastReviewedAt: T0,
    });
    // After a lapse the next pass restarts at 1 day.
    expect(reviewSrsCard(failed, "good", T0).interval).toBe(1);
  });

  test("failing a brand-new card is not a lapse", () => {
    expect(reviewSrsCard(createSrsCard(T0), "again", T0).lapses).toBe(0);
  });

  test("previews the next delay for each grade", () => {
    const preview = previewSrsIntervals(createSrsCard(T0), T0);
    expect(preview).toEqual({
      again: SRS_RELEARN_DELAY_MS,
      hard: DAY_MS,
      good: DAY_MS,
      easy: DAY_MS,
    });
    expect(formatSrsInterval(preview.again)).toBe("10m");
    expect(formatSrsInterval(preview.good)).toBe("1d");
    expect(formatSrsInterval(45 * DAY_MS)).toBe("2mo");
  });
});

describe("buildStudyQueue", () => {
  const card = (id: string, addedAt: number, srs: Partial<SrsCardState> = {}) => ({
    id,
    addedAt,
    srs: { ...createSrsCard(addedAt), ...srs },
  });

  test("puts due reviews first (most overdue first), then new cards by age", () => {
    const now = T0 + 10 * DAY_MS;
    const cards = [
      card("new-late", T0 + 2),
      card("due-recent", T0, { lastReviewedAt: T0, dueAt: now - DAY_MS }),
      card("not-due", T0, { lastReviewedAt: T0, dueAt: now + DAY_MS }),
      card("new-early", T0 + 1),
      card("due-old", T0, { lastReviewedAt: T0, dueAt: now - 5 * DAY_MS }),
    ];
    expect(buildStudyQueue(cards, { now }).map((c) => c.id)).toEqual([
      "due-old",
      "due-recent",
      "new-early",
      "new-late",
    ]);
  });

  test("caps the number of new cards per session", () => {
    const cards = Array.from({ length: 5 }, (_, i) => card(`n${i}`, T0 + i));
    expect(buildStudyQueue(cards, { now: T0, newLimit: 2 }).map((c) => c.id)).toEqual([
      "n0",
      "n1",
    ]);
  });
});

describe("sanitizeSrsCard", () => {
  test("repairs malformed synced data", () => {
    expect(sanitizeSrsCard(null, T0)).toEqual(createSrsCard(T0));
    expect(
      sanitizeSrsCard({ ease: 0.5, interval: -3, repetitions: 2.7, lapses: "x", dueAt: NaN }, T0)
    ).toEqual({ ease: SRS_MIN_EASE, interval: 0, repetitions: 2, lapses: 0, dueAt: T0 });
    expect(sanitizeSrsCard({ lastReviewedAt: T0 - 1 }, T0).lastReviewedAt).toBe(T0 - 1);
  });
});
