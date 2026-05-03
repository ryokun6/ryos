export const MUSIC_QUIZ_SNIPPET_MS = 10_000;
export const MUSIC_QUIZ_MAX_POINTS_PER_ROUND = 200;

/** More time left in the snippet window ⇒ more points (0 at timeout). */
export function computeSpeedScore(
  elapsedMs: number,
  windowMs: number = MUSIC_QUIZ_SNIPPET_MS,
  maxPoints: number = MUSIC_QUIZ_MAX_POINTS_PER_ROUND
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  if (elapsedMs >= windowMs) return 0;
  const remaining = windowMs - elapsedMs;
  return Math.max(0, Math.round((remaining / windowMs) * maxPoints));
}

export function musicQuizMaxScore(
  rounds: number,
  maxPerRound: number = MUSIC_QUIZ_MAX_POINTS_PER_ROUND
): number {
  return rounds * maxPerRound;
}
