// Pure helpers for the AppleMusicPlayerBridge.
//
// Lives in its own module so the bridge component file only exports the
// component itself — keeping React Fast Refresh working for hot reloads
// during development (`react-refresh/only-export-components`).

import { isAppleMusicCollectionTrack, type Track } from "@/stores/useIpodStore";

/** MusicKit song id used in `setQueue({ song | songs })`. */
export function getMusicKitSongId(track: Track): string | null {
  const params = track.appleMusicPlayParams;
  if (!params || params.stationId || params.playlistId) return null;
  return params.kind === "library-songs"
    ? params.libraryId || params.catalogId || null
    : params.catalogId || params.libraryId || null;
}

export interface MusicKitSongQueue {
  songIds: string[];
  trackIds: string[];
}

/** Build parallel MusicKit song ids + ryOS track ids for a playback list. */
export function buildMusicKitSongQueue(tracks: Track[]): MusicKitSongQueue {
  const songIds: string[] = [];
  const trackIds: string[] = [];
  for (const track of tracks) {
    if (isAppleMusicCollectionTrack(track)) continue;
    const songId = getMusicKitSongId(track);
    if (!songId) continue;
    songIds.push(songId);
    trackIds.push(track.id);
  }
  return { songIds, trackIds };
}

/** Stable identity for a native MusicKit multi-song queue. */
export function buildMusicKitQueueIdentity(songIds: string[]): string {
  return songIds.join("\0");
}

/**
 * Whether to drive playback through MusicKit's native multi-song queue
 * (`setQueue({ songs, startWith })`) instead of single-song queues.
 *
 * Shuffle and repeat-one need ryOS to own track selection, so they stay on
 * the legacy single-song path.
 */
export function shouldUseNativeMusicKitSongQueue(
  queueTracks: Track[],
  options: { isShuffled: boolean; loopCurrent: boolean }
): boolean {
  if (options.isShuffled || options.loopCurrent) return false;
  return buildMusicKitSongQueue(queueTracks).songIds.length >= 2;
}

/** Index of `currentTrack` inside a native MusicKit song queue. */
export function getMusicKitQueueStartIndex(
  queueTracks: Track[],
  currentTrack: Track | null
): number {
  if (!currentTrack) return 0;
  const { trackIds } = buildMusicKitSongQueue(queueTracks);
  const idx = trackIds.indexOf(currentTrack.id);
  return idx >= 0 ? idx : 0;
}

/** Map a MusicKit media-item id back to a ryOS `am:…` track id. */
export function findTrackIdByMusicKitItemId(
  queueTracks: Track[],
  itemId: string | null
): string | null {
  if (!itemId) return null;
  const bare = itemId.startsWith("am:") ? itemId.slice(3) : itemId;
  for (const track of queueTracks) {
    const params = track.appleMusicPlayParams;
    if (!params) continue;
    if (
      track.id === itemId ||
      track.id === `am:${bare}` ||
      params.catalogId === bare ||
      params.libraryId === bare ||
      params.catalogId === itemId ||
      params.libraryId === itemId
    ) {
      return track.id;
    }
  }
  return null;
}

/** True when MusicKit is already playing the target song id. */
export function isMusicKitPlayingSongId(
  nowPlayingItemId: string | null,
  targetSongId: string | null
): boolean {
  if (!nowPlayingItemId || !targetSongId) return false;
  if (nowPlayingItemId === targetSongId) return true;
  const bareNow = nowPlayingItemId.startsWith("am:")
    ? nowPlayingItemId.slice(3)
    : nowPlayingItemId;
  const bareTarget = targetSongId.startsWith("am:")
    ? targetSongId.slice(3)
    : targetSongId;
  return bareNow === bareTarget;
}

/**
 * Decide whether a `playbackStateDidChange` event should fan out to the
 * parent's `onEnded` callback (which triggers our own next-track handler).
 *
 * MusicKit JS fires `ended` (state=5) once for *every* track that finishes.
 * Inside a multi-item queue (catalog station / playlist set up via
 * `setQueue({ station | playlist })`, or a native multi-song queue via
 * `setQueue({ songs })`), MusicKit auto-advances to the next item
 * internally — invoking `onEnded` then would call our parent's
 * `nextTrack` → `skipToNextItem()`, skipping past the item MusicKit just
 * moved to and visibly mismatching the displayed Now Playing entry from
 * what's actually playing. Suppress for shells and native song queues; the
 * terminal `completed` (state=10) signal still hands control back when the
 * whole queue is exhausted.
 */
export function shouldFireEndedForPlaybackState(
  state: number | undefined,
  currentTrack: Track | null,
  usesNativeMultiSongQueue = false
): boolean {
  if (state === 10) return true;
  if (state === 5) {
    if (isAppleMusicCollectionTrack(currentTrack)) return false;
    if (usesNativeMultiSongQueue) return false;
    return true;
  }
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

export function getQueueOptionsForTrack(
  track: Track
): MusicKit.SetQueueOptions | null {
  const params = track.appleMusicPlayParams;
  if (!params) return null;
  if (params.stationId) {
    return { station: params.stationId, startPlaying: true };
  }
  if (params.playlistId) {
    return { playlist: params.playlistId, startPlaying: true };
  }
  const id = getMusicKitSongId(track);
  if (!id) return null;
  return { song: id, startPlaying: true };
}

export function getQueueOptionsForNativeSongQueue(
  queueTracks: Track[],
  currentTrack: Track,
  startPlaying: boolean
): MusicKit.SetQueueOptions | null {
  const { songIds } = buildMusicKitSongQueue(queueTracks);
  if (songIds.length < 2) return null;
  const startWith = getMusicKitQueueStartIndex(queueTracks, currentTrack);
  return { songs: songIds, startWith, startPlaying };
}
