export interface LyricsTranslationReadiness {
  songId: string;
  loadedSongId: string | null;
  originalLineCount: number;
  isFetchingOriginal: boolean;
}

/**
 * Translation must only start from lyrics loaded for the current song.
 *
 * React runs the fetch and translation effects from the same committed
 * render. On a track change, the translation effect can therefore still see
 * the previous track's lines until the fetch effect's reset is rendered.
 */
export function canStartLyricsTranslation({
  songId,
  loadedSongId,
  originalLineCount,
  isFetchingOriginal,
}: LyricsTranslationReadiness): boolean {
  return (
    Boolean(songId) &&
    loadedSongId === songId &&
    originalLineCount > 0 &&
    !isFetchingOriginal
  );
}
