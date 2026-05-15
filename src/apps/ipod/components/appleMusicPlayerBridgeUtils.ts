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
 * picks a *different* random song (so the bug is most obvious with shuffle
 * on); in sequential mode each call advances one step (skipping a song).
 * The two back-to-back `setQueue(...)` calls then race inside MusicKit so
 * the song the user actually hears can mismatch the song the iPod displays
 * (the display reflects the *latest* store update, but the audio can
 * settle on whichever `setQueue` resolved last). Suppress the second
 * fan-out within a window long enough to span the state 5 → state 10
 * transition for the same item, but short enough never to swallow a
 * subsequent track's own end-of-playback signal (real songs are minimum
 * tens of seconds long).
 */
export const ENDED_FANOUT_DEDUP_WINDOW_MS = 3000;

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

/**
 * Pull a stable identifier out of a MusicKit `playbackStateDidChange` /
 * `mediaItemDidChange` event payload. Used as the *primary* dedup key for
 * `onEnded` fan-out: when state=5 and state=10 reference the same item
 * (the just-ended song), the second event's id matches the first and we
 * suppress regardless of timing.
 *
 * Falls back through the multiple shapes MusicKit JS uses across versions
 * (`item.id`, `item.attributes.playParams.id`,
 * `item.attributes.playParams.catalogId`).
 */
/**
 * While `setQueue` runs with `startPlaying: false`, MusicKit JS commonly
 * emits `loading` / `paused` / `stopped` playback states before we call
 * `play()`. Forwarding those to the iPod store flips `isPlaying` off, so
 * the post-queue `play()` is skipped and the user hears silence even
 * though they just tapped a song. Suppress parent fan-out for non-terminal
 * states until the queue load settles.
 */
export function shouldSuppressPlaybackStateFanoutWhileQueueLoading(
  queueLoading: boolean,
  state: number | undefined
): boolean {
  if (!queueLoading) return false;
  // Terminal states are still unexpected mid-load, but ended/completed
  // should never be swallowed if they somehow arrive.
  if (state === 5 || state === 10) return false;
  return true;
}

/**
 * Returns true when an in-flight queue load should abandon further work.
 * Each explicit track selection bumps `currentGeneration`; stale async
 * blocks must not call `play()` or stamp `lastQueuedTrackId` after a
 * newer selection has already started — otherwise MusicKit can keep
 * playing the previous song while the iPod UI shows the latest pick.
 */
export function isStaleQueueLoad(
  loadGeneration: number,
  currentGeneration: number,
  cancelled: boolean
): boolean {
  return cancelled || loadGeneration !== currentGeneration;
}

export function getMusicKitEventItemId(
  item:
    | {
        id?: string;
        attributes?: {
          playParams?: { id?: string; catalogId?: string };
        };
      }
    | null
    | undefined
): string | null {
  if (!item) return null;
  return (
    item.id ||
    item.attributes?.playParams?.id ||
    item.attributes?.playParams?.catalogId ||
    null
  );
}
