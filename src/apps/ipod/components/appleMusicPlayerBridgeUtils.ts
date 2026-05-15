// Pure helpers for the AppleMusicPlayerBridge.
//
// Lives in its own module so the bridge component file only exports the
// component itself — keeping React Fast Refresh working for hot reloads
// during development (`react-refresh/only-export-components`).

import { isAppleMusicCollectionTrack, type Track } from "@/stores/useIpodStore";

export interface AppleMusicQueueBuildResult {
  options: MusicKit.SetQueueOptions;
  /**
   * Changes when the MusicKit queue contents change, but not when playback
   * advances inside that queue.
   */
  definitionKey: string;
  /** Changes for an explicit request to start at a different track. */
  requestKey: string;
  /** iPod track ids represented by `options.songs`, in queue order. */
  queuedTrackIds: string[];
  isMultiSongQueue: boolean;
  /** Index to pass to `changeToMediaAtIndex` when jumping inside a queue. */
  startWithIndex: number | null;
  queueKind: "song" | "songs" | "album" | "playlist" | "station";
}

export function getAppleMusicSongQueueId(track: Track): string | null {
  const params = track.appleMusicPlayParams;
  if (!params || params.stationId || params.playlistId) return null;
  const id =
    params.kind === "library-songs"
      ? params.libraryId || params.catalogId
      : params.catalogId || params.libraryId;
  return id || null;
}

function normalizeAppleMusicTrackId(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.startsWith("am:") ? id : `am:${id}`;
}

function dedupeQueueTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

/** Catalog album id when every track in the list shares one. */
export function getSharedAlbumCatalogId(tracks: Track[]): string | null {
  if (tracks.length < 2) return null;
  const albumIds = tracks
    .map((track) => track.appleMusicAlbumId)
    .filter((id): id is string => Boolean(id));
  if (albumIds.length !== tracks.length) return null;
  const unique = new Set(albumIds);
  if (unique.size !== 1) return null;
  const albumId = albumIds[0]!;
  // Library album ids (`l.*`) are not valid for `setQueue({ album })`.
  if (albumId.startsWith("l.") || albumId.startsWith("i.")) return null;
  return albumId;
}

export function buildAppleMusicSingleSongQueueOptions(
  track: Track,
  songId: string
): AppleMusicQueueBuildResult {
  return {
    options: { song: songId, startPlaying: true },
    definitionKey: `song:${track.id}`,
    requestKey: `song:${track.id}`,
    queuedTrackIds: [track.id],
    isMultiSongQueue: false,
    startWithIndex: null,
    queueKind: "song",
  };
}

export function buildAppleMusicQueuePlacementOptions(
  track: Track
): MusicKit.SetQueueOptions | null {
  const built = buildAppleMusicQueueOptions(track, [track]);
  return built?.options ?? null;
}

/**
 * When only the start position changes inside an existing MusicKit queue,
 * jump with `changeToMediaAtIndex` instead of rebuilding the queue.
 */
export function getInQueueNavigationIndex(
  queueBuild: AppleMusicQueueBuildResult,
  lastDefinitionKey: string | null
): number | null {
  if (!lastDefinitionKey || lastDefinitionKey !== queueBuild.definitionKey) {
    return null;
  }
  if (queueBuild.startWithIndex == null || queueBuild.startWithIndex < 0) {
    return null;
  }
  if (
    queueBuild.queueKind !== "songs" &&
    queueBuild.queueKind !== "album"
  ) {
    return null;
  }
  return queueBuild.startWithIndex;
}

export function buildAppleMusicQueueOptions(
  currentTrack: Track,
  queueTracks?: Track[] | null
): AppleMusicQueueBuildResult | null {
  const params = currentTrack.appleMusicPlayParams;
  if (!params) return null;

  if (params.stationId) {
    return {
      options: { station: params.stationId, startPlaying: true },
      definitionKey: `station:${params.stationId}`,
      requestKey: `station:${params.stationId}`,
      queuedTrackIds: [],
      isMultiSongQueue: false,
      startWithIndex: null,
      queueKind: "station",
    };
  }

  if (params.playlistId) {
    return {
      options: { playlist: params.playlistId, startPlaying: true },
      definitionKey: `playlist:${params.playlistId}`,
      requestKey: `playlist:${params.playlistId}`,
      queuedTrackIds: [],
      isMultiSongQueue: false,
      startWithIndex: null,
      queueKind: "playlist",
    };
  }

  const currentSongId = getAppleMusicSongQueueId(currentTrack);
  if (!currentSongId) return null;

  const songQueueTracks = dedupeQueueTracks(
    (queueTracks ?? []).filter((track) => getAppleMusicSongQueueId(track))
  );
  const queueContainsCurrent = songQueueTracks.some(
    (track) => track.id === currentTrack.id
  );

  if (songQueueTracks.length > 1 && queueContainsCurrent) {
    const startWith = songQueueTracks.findIndex(
      (track) => track.id === currentTrack.id
    );
    const queuedTrackIds = songQueueTracks.map((track) => track.id);
    const albumQueueId = getSharedAlbumCatalogId(songQueueTracks);

    if (albumQueueId && startWith >= 0) {
      const definitionKey = `album:${albumQueueId}`;
      return {
        options: { album: albumQueueId, startWith, startPlaying: true },
        definitionKey,
        requestKey: `${definitionKey}:start:${currentTrack.id}`,
        queuedTrackIds,
        isMultiSongQueue: true,
        startWithIndex: startWith,
        queueKind: "album",
      };
    }

    const songs = songQueueTracks
      .map((track) => getAppleMusicSongQueueId(track))
      .filter((id): id is string => Boolean(id));
    const definitionKey = `songs:${queuedTrackIds.join("\u0000")}`;
    return {
      options: { songs, startWith, startPlaying: true },
      definitionKey,
      requestKey: `${definitionKey}:start:${currentTrack.id}`,
      queuedTrackIds,
      isMultiSongQueue: true,
      startWithIndex: startWith,
      queueKind: "songs",
    };
  }

  return buildAppleMusicSingleSongQueueOptions(currentTrack, currentSongId);
}

/**
 * Whether MusicKit's `nowPlayingItem` should drive the iPod's current track.
 * Skips while an explicit user selection is still being queued so polling
 * does not revert the UI to the previous song mid-`setQueue`.
 */
export function shouldSyncQueueTrackFromMediaItem(
  resolvedTrackId: string | null,
  currentTrackId: string | null | undefined,
  playbackTargetTrackId: string | null,
  queuedTrackIds: string[]
): boolean {
  if (!resolvedTrackId || !queuedTrackIds.includes(resolvedTrackId)) {
    return false;
  }
  if (resolvedTrackId === currentTrackId) return false;
  if (
    playbackTargetTrackId &&
    resolvedTrackId !== playbackTargetTrackId
  ) {
    return false;
  }
  return true;
}

export function resolveAppleMusicQueueTrackIdFromMediaItem(
  item: MusicKit.MediaItem | null | undefined,
  queueTracks: Track[]
): string | null {
  if (!item) return null;
  const candidates = [
    item.id,
    item.attributes?.playParams?.catalogId,
    item.attributes?.playParams?.id,
  ].filter((id): id is string => Boolean(id));

  for (const track of queueTracks) {
    const queueId = getAppleMusicSongQueueId(track);
    if (
      candidates.includes(track.id) ||
      (queueId !== null && candidates.includes(queueId))
    ) {
      return track.id;
    }
  }

  for (const candidate of candidates) {
    const normalized = normalizeAppleMusicTrackId(candidate);
    if (normalized) return normalized;
  }

  return null;
}

/**
 * Decide whether a `playbackStateDidChange` event should fan out to the
 * parent's `onEnded` callback (which triggers our own next-track handler).
 *
 * MusicKit JS fires `ended` (state=5) once for *every* track that finishes.
 * Inside a multi-item MusicKit queue (song array, catalog station, or
 * playlist), MusicKit auto-advances to the next
 * item internally — invoking `onEnded` then would call our parent's
 * `nextTrack` → `skipToNextItem()`, skipping past the item MusicKit just
 * moved to and visibly mismatching the displayed Now Playing entry from
 * what's actually playing. Suppress for shells; the terminal `completed`
 * (state=10) signal still hands control back when the whole queue is
 * exhausted.
 */
export function shouldFireEndedForPlaybackState(
  state: number | undefined,
  currentTrack: Track | null,
  isMultiItemMusicKitQueue = false
): boolean {
  if (state === 10) return true;
  if (state === 5 && isMultiItemMusicKitQueue) return false;
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
