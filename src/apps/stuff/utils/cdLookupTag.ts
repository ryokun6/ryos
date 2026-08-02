/**
 * CD / album lookup tagging helpers for Stuff scan → add flows.
 * Mirrors Books tagging in bookBarcode.ts for iTunes album hits.
 */

/** True when a product lookup candidate came from iTunes music/album search. */
export function isItunesMusicLookupResult(params: {
  source?: string | null;
}): boolean {
  return params.source === "itunes_music";
}

/**
 * Ensure CD is among tagIds for a new album-lookup item.
 * No-op when not an album hit; merges without removing other tags.
 */
export function tagIdsWithDefaultCd(
  existingTagIds: string[] | undefined,
  cdTagId: string,
  isCd: boolean
): string[] | undefined {
  if (!isCd || !cdTagId) return existingTagIds;
  const ids = existingTagIds ?? [];
  if (ids.includes(cdTagId)) return ids;
  return [...ids, cdTagId];
}
