// Shared "previous / back" transport behavior for the media players
// (iPod + Karaoke). Centralized here so both apps — and their unit tests —
// agree on the threshold and decision logic.

/**
 * Seconds into the current track after which the "previous / back" transport
 * control restarts the current song (seek to 0) instead of skipping to the
 * previous track. This mirrors the classic click-wheel iPod: a single press
 * while a song is well underway restarts it, and a second press (now near 0s)
 * skips to the previous track for real.
 */
export const PREVIOUS_RESTART_THRESHOLD_SECONDS = 3;

/**
 * Decide whether pressing "previous / back" should restart the current track
 * rather than navigate to the previous one.
 *
 * @param elapsedSeconds Current playback position of the active track.
 * @param hasCurrentTrack Whether a track is actually loaded/selected.
 * @param thresholdSeconds Override for the restart threshold (defaults to
 *   {@link PREVIOUS_RESTART_THRESHOLD_SECONDS}).
 */
export function shouldRestartTrackOnPrevious(
  elapsedSeconds: number,
  hasCurrentTrack: boolean,
  thresholdSeconds: number = PREVIOUS_RESTART_THRESHOLD_SECONDS
): boolean {
  return (
    hasCurrentTrack &&
    Number.isFinite(elapsedSeconds) &&
    elapsedSeconds > thresholdSeconds
  );
}
