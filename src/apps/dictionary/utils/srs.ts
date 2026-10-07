/**
 * SM-2 spaced repetition (SuperMemo 2, Woźniak 1990) for Dictionary
 * flashcards. Grades map onto SM-2 quality scores; failing grades restart the
 * repetition count without touching the ease factor and requeue the card a few
 * minutes later so it comes back within the same study session.
 */

export const SRS_GRADES = ["again", "hard", "good", "easy"] as const;
export type SrsGrade = (typeof SRS_GRADES)[number];

export const SRS_GRADE_QUALITY: Record<SrsGrade, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export const SRS_DEFAULT_EASE = 2.5;
export const SRS_MIN_EASE = 1.3;
export const SRS_RELEARN_DELAY_MS = 10 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface SrsCardState {
  ease: number;
  /** Current interval in days (0 for cards never passed). */
  interval: number;
  repetitions: number;
  lapses: number;
  dueAt: number;
  lastReviewedAt?: number;
}

export function createSrsCard(now: number = Date.now()): SrsCardState {
  return {
    ease: SRS_DEFAULT_EASE,
    interval: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: now,
  };
}

export function isNewCard(card: SrsCardState): boolean {
  return card.lastReviewedAt == null;
}

export function nextEase(ease: number, quality: number): number {
  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  return Math.max(SRS_MIN_EASE, Math.round((ease + delta) * 100) / 100);
}

export function reviewSrsCard(
  card: SrsCardState,
  grade: SrsGrade,
  now: number = Date.now()
): SrsCardState {
  const quality = SRS_GRADE_QUALITY[grade];

  if (quality < 3) {
    return {
      ...card,
      repetitions: 0,
      interval: 0,
      lapses: card.repetitions > 0 ? card.lapses + 1 : card.lapses,
      dueAt: now + SRS_RELEARN_DELAY_MS,
      lastReviewedAt: now,
    };
  }

  const ease = nextEase(card.ease, quality);
  let interval: number;
  if (card.repetitions === 0) interval = 1;
  else if (card.repetitions === 1) interval = 6;
  else interval = Math.max(1, Math.round(card.interval * ease));

  return {
    ease,
    interval,
    repetitions: card.repetitions + 1,
    lapses: card.lapses,
    dueAt: now + interval * DAY_MS,
    lastReviewedAt: now,
  };
}

/** Delay until the card would next be due for each grade (for button hints). */
export function previewSrsIntervals(
  card: SrsCardState,
  now: number = Date.now()
): Record<SrsGrade, number> {
  return Object.fromEntries(
    SRS_GRADES.map((grade) => [
      grade,
      reviewSrsCard(card, grade, now).dueAt - now,
    ])
  ) as Record<SrsGrade, number>;
}

export function isCardDue(card: SrsCardState, now: number = Date.now()): boolean {
  return card.dueAt <= now;
}

/**
 * Study queue: overdue review cards first (most overdue first), then up to
 * `newLimit` never-studied cards in the order they were added.
 */
export function buildStudyQueue<T extends { srs: SrsCardState; addedAt: number }>(
  cards: readonly T[],
  options: { now?: number; newLimit?: number } = {}
): T[] {
  const now = options.now ?? Date.now();
  const newLimit = options.newLimit ?? 20;
  const reviews: T[] = [];
  const fresh: T[] = [];
  for (const card of cards) {
    if (isNewCard(card.srs)) fresh.push(card);
    else if (isCardDue(card.srs, now)) reviews.push(card);
  }
  reviews.sort((a, b) => a.srs.dueAt - b.srs.dueAt);
  fresh.sort((a, b) => a.addedAt - b.addedAt);
  return [...reviews, ...fresh.slice(0, Math.max(0, newLimit))];
}

export function sanitizeSrsCard(value: unknown, now: number = Date.now()): SrsCardState {
  if (!value || typeof value !== "object") return createSrsCard(now);
  const record = value as Partial<SrsCardState>;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    ease: Math.max(SRS_MIN_EASE, num(record.ease, SRS_DEFAULT_EASE)),
    interval: Math.max(0, num(record.interval, 0)),
    repetitions: Math.max(0, Math.floor(num(record.repetitions, 0))),
    lapses: Math.max(0, Math.floor(num(record.lapses, 0))),
    dueAt: num(record.dueAt, now),
    ...(typeof record.lastReviewedAt === "number" &&
    Number.isFinite(record.lastReviewedAt)
      ? { lastReviewedAt: record.lastReviewedAt }
      : {}),
  };
}
