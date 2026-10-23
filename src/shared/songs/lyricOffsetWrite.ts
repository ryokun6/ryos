/**
 * Shared lyric-offset writes.
 *
 * Any signed-in user may save only `lyricOffset` on a song. Title, artist,
 * album, cover, and lyrics source stay on the owner/admin path.
 */

export const LYRIC_OFFSET_MIN_MS = -300_000;
export const LYRIC_OFFSET_MAX_MS = 300_000;

const METADATA_KEYS = [
  "title",
  "artist",
  "album",
  "cover",
  "coverColor",
  "lyricsSource",
  "clearTranslations",
  "clearFurigana",
  "clearSoramimi",
  "clearLyrics",
  "clearCoverColor",
  "isShare",
  "action",
] as const;

export function clampLyricOffset(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return Math.min(LYRIC_OFFSET_MAX_MS, Math.max(LYRIC_OFFSET_MIN_MS, rounded));
}

export function isLyricOffsetOnlyPatch(body: object): boolean {
  if (!("lyricOffset" in body)) return false;
  const offset = (body as { lyricOffset?: unknown }).lyricOffset;
  if (typeof offset !== "number" || !Number.isFinite(offset)) return false;
  for (const key of METADATA_KEYS) {
    if (key in body && (body as Record<string, unknown>)[key] !== undefined) {
      return false;
    }
  }
  return true;
}
