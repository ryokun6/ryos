import {
  appleMusicKitIdToLyricsSongId,
  isAppleMusicCollectionTrack,
  type AppleMusicKitNowPlaying,
  type Track,
} from "@/stores/useIpodStore";

/**
 * Lyrics-search metadata resolved against the *actual song* the iPod
 * is playing (rather than the iPod track shell visible in the library
 * UI).
 *
 * For Apple Music **stations** and **playlists** the iPod's
 * `currentTrack` is a shell whose `title` / `artist` describe the
 * station or playlist itself ("Today's Hits" by "Apple Music"). The
 * song MusicKit is currently streaming through that shell lives in
 * `appleMusicKitNowPlaying`. Lyrics must follow the live song —
 * searching with the station / playlist name returns obviously wrong
 * results.
 *
 * For library tracks (YouTube or Apple Music songs) `currentTrack`
 * already describes the song, so the live MusicKit metadata is
 * irrelevant.
 */
export interface LyricsTrackMetadata {
  /** Title to feed `useLyrics` and the lyrics search dialog. Empty
   *  string for a station / playlist that hasn't received its first
   *  MusicKit `mediaItemDidChange` yet. */
  title: string;
  /** Artist to feed `useLyrics` and the lyrics search dialog. Empty
   *  string in the same shell-without-live-metadata case as `title`. */
  artist: string;
  /** Song id to feed `useLyrics`. For collections that's the
   *  `am:<musickit-id>` of the live song; for library tracks it's
   *  `currentTrack.id`. Empty string when no song id is available
   *  (e.g. station with no live media item yet) — `useLyrics` already
   *  bails out on empty `songId`, so this also guards the auto-fetch
   *  from running with the wrong title / artist. */
  songId: string;
}

/**
 * Resolve the title / artist / song id that lyrics flows (auto-fetch
 * via `useLyrics` AND the manual lyrics-search dialog) should use for
 * the iPod's current track.
 *
 * Critically, for Apple Music stations / playlists this NEVER falls
 * back to the shell's title / artist when the live MusicKit metadata
 * is missing — falling back would search lyrics for the station /
 * playlist name (e.g. "Today's Hits" by "Apple Music") and return
 * results that have nothing to do with the song actually playing.
 */
export function resolveLyricsTrackMetadata(
  currentTrack: Track | null | undefined,
  appleMusicKitNowPlaying: AppleMusicKitNowPlaying | null | undefined
): LyricsTrackMetadata {
  if (!currentTrack) {
    return { title: "", artist: "", songId: "" };
  }

  if (isAppleMusicCollectionTrack(currentTrack)) {
    return {
      title: appleMusicKitNowPlaying?.title?.trim() ?? "",
      artist: appleMusicKitNowPlaying?.artist?.trim() ?? "",
      songId: appleMusicKitIdToLyricsSongId(appleMusicKitNowPlaying?.id),
    };
  }

  return {
    title: currentTrack.title ?? "",
    artist: currentTrack.artist ?? "",
    songId: currentTrack.id ?? "",
  };
}

/**
 * Resolve the id we should persist a manual lyrics-source override
 * against. For Apple Music stations / playlists the override must be
 * keyed on the live MusicKit song id, NOT the shell — otherwise every
 * song streamed through that station / playlist would inherit the
 * user's pick.
 *
 * Returns `null` when no usable id is available (e.g. a station with
 * no live media item yet) so callers can no-op rather than persisting
 * against the wrong key.
 */
export function resolveLyricsOverrideTargetId(
  currentTrack: Track | null | undefined,
  appleMusicKitNowPlaying: AppleMusicKitNowPlaying | null | undefined
): string | null {
  if (!currentTrack) return null;
  if (isAppleMusicCollectionTrack(currentTrack)) {
    const liveId = appleMusicKitIdToLyricsSongId(
      appleMusicKitNowPlaying?.id
    );
    return liveId || null;
  }
  return currentTrack.id ?? null;
}
