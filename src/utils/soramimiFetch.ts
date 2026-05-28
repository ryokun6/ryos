/**
 * Pure helpers for soramimi (misheard lyrics) fetch sequencing in useFurigana.
 */

/** Max time to wait for furigana before starting soramimi on Japanese tracks. */
export function isFuriganaReadyForSoramimi(
  isJapanese: boolean,
  isFetchingFurigana: boolean
): boolean {
  return !isJapanese || !isFetchingFurigana;
}

/** Default in-flight guard: abort and restart if a prior request exceeds this age. */
export const SORAMIMI_INFLIGHT_MAX_MS = 5 * 60 * 1000;

/** Effect-level safety timeout for a single soramimi fetch attempt. */
export const SORAMIMI_FETCH_TIMEOUT_MS = 5 * 60 * 1000;
