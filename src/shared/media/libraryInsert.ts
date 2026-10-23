/**
 * Queueing a song must add it to the local library without changing whatever
 * is already playing.
 */
export function insertTrackKeepingPlayback<T extends { id: string }>(
  tracks: readonly T[],
  track: T
): T[] {
  if (tracks.some((item) => item.id === track.id)) return [...tracks];
  return [track, ...tracks];
}
