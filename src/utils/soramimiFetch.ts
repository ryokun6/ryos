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

/**
 * Client safety timeout — slightly above api/songs/[id].ts maxDuration (120s)
 * so we clear UI loading when the platform cuts the SSE stream.
 */
export const SORAMIMI_FETCH_TIMEOUT_MS = 130_000;
