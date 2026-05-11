// Pure helpers for the AppleMusicPlayerBridge.
//
// Lives in its own module so the bridge component file only exports the
// component itself — keeping React Fast Refresh working for hot reloads
// during development (`react-refresh/only-export-components`).

import { isAppleMusicCollectionTrack, type Track } from "@/stores/useIpodStore";

/**
 * Decide whether a `playbackStateDidChange` event should fan out to the
 * parent's `onEnded` callback (which triggers our own next-track handler).
 *
 * MusicKit JS fires `ended` (state=5) once for *every* track that finishes.
 * Inside a multi-item queue (catalog station / playlist set up via
 * `setQueue({ station | playlist })`), MusicKit auto-advances to the next
 * item internally — invoking `onEnded` then would call our parent's
 * `nextTrack` → `skipToNextItem()`, skipping past the item MusicKit just
 * moved to and visibly mismatching the displayed Now Playing entry from
 * what's actually playing. Suppress for shells; the terminal `completed`
 * (state=10) signal still hands control back when the whole queue is
 * exhausted.
 */
export function shouldFireEndedForPlaybackState(
  state: number | undefined,
  currentTrack: Track | null
): boolean {
  if (state === 10) return true;
  if (state === 5) return !isAppleMusicCollectionTrack(currentTrack);
  return false;
}

/**
 * Dedup window for `onEnded` fan-out.
 *
 * MusicKit JS fires *both* `ended` (state=5) and `completed` (state=10) when
 * a single-song queue (`setQueue({ song: id })`) finishes its only item:
 *   - state=5 fires when the song itself ends.
 *   - state=10 fires immediately afterwards because the queue is now empty.
 *
 * If the bridge forwards both events to the parent's `onEnded`, our
 * `handleTrackEnd` → `nextTrack` runs *twice*. In shuffle mode each call
 * picks a different random song; in sequential mode each call advances
 * one step. The two back-to-back `setQueue(...)` calls then race inside
 * MusicKit so the song the user actually hears can mismatch the song the
 * iPod displays (the display reflects the *latest* store update, but the
 * audio can settle on whichever `setQueue` resolves last). Suppress the
 * second fan-out within a window long enough to span the state 5 → state
 * 10 transition for the same item, but short enough never to swallow a
 * subsequent track's own end-of-playback signal.
 */
export const ENDED_FANOUT_DEDUP_WINDOW_MS = 1500;

/**
 * Returns true when an `onEnded` fan-out at `now` should be suppressed
 * because we already fanned out for the same song-ending event at
 * `lastFiredAt`. `lastFiredAt <= 0` means we haven't fanned out yet.
 *
 * Exported so the regression test pinning the dedup behavior can run
 * without spinning up React + MusicKit.
 */
export function isWithinEndedFanoutDedupWindow(
  now: number,
  lastFiredAt: number,
  windowMs: number = ENDED_FANOUT_DEDUP_WINDOW_MS
): boolean {
  if (lastFiredAt <= 0) return false;
  return now - lastFiredAt < windowMs;
}
