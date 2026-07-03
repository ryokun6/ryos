/**
 * MediaCore library model.
 *
 * One item model for the media apps: songs (iPod / Karaoke / Winamp library)
 * and videos (Videos / TV library) share the same base shape — `Video` was
 * historically a strict subset of `Track`. The two libraries stay separate
 * (physical storage in `useIpodStore.tracks` and `useVideoStore.videos`,
 * keeping the Cloud Sync v2 wire format byte-identical); music and videos
 * are never merged into one library surface.
 *
 * This module is shared with the server (`api/_utils/song-library-state.ts`),
 * so it must stay free of client-only imports.
 */

/** Lyrics source from Kugou */
export interface LyricsSource {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
}

/** Library source the iPod is currently displaying. */
export type LibrarySource = "youtube" | "appleMusic";

/** Apple Music play parameters needed for `setQueue` (catalog vs library). */
export interface AppleMusicPlayParams {
  /** Catalog song ID (numeric string) when available — preferred for setQueue. */
  catalogId?: string;
  /** Library song ID (`i.<hash>` form) for personal library tracks. */
  libraryId?: string;
  /** Catalog station ID (`ra.*` form) for Apple Music radio playback. */
  stationId?: string;
  /** Catalog playlist ID (`pl.*` form) for recommendation playback. */
  playlistId?: string;
  /** MusicKit kind, e.g. "song", "library-song". */
  kind: string;
  isLibrary?: boolean;
}

/** Base shape shared by every library item (song or video). */
export interface MediaItemBase {
  id: string;
  url: string;
  title: string;
  artist?: string;
}

/** Song in the music library (iPod / Karaoke / Winamp). */
export interface Track extends MediaItemBase {
  album?: string;
  /** Album-level artist for grouping compilations/collaborative albums. */
  albumArtist?: string;
  /** Apple Music album/library album id when available, used for album grouping. */
  appleMusicAlbumId?: string;
  /** Cover image URL from Kugou */
  cover?: string;
  /** Cached boosted cover color for lyrics/title glow */
  coverColor?: string;
  /** Offset in milliseconds to adjust lyrics timing for this track (positive = lyrics earlier) */
  lyricOffset?: number;
  /** Selected lyrics source from Kugou (user override) */
  lyricsSource?: LyricsSource;
  /** Server/library creation time (ms); used for All Songs order (newest first) */
  createdAt?: number;
  /** Stable sequence when createdAt ties (e.g. bulk import index) */
  importOrder?: number;
  /** Last metadata update from server (ms); tiebreaker for list order */
  updatedAt?: number;
  /** Origin of this track. Defaults to "youtube" when unset for back-compat. */
  source?: LibrarySource;
  /** Track duration in milliseconds (Apple Music exposes this up front). */
  durationMs?: number;
  /** Apple Music play parameters used to drive MusicKit playback. */
  appleMusicPlayParams?: AppleMusicPlayParams;
}

/** Video in the Videos / TV library. */
export type VideoItem = MediaItemBase;

/**
 * Project a song onto the video shape (used by the TV app's MTV channel,
 * which plays the music library as a channel lineup).
 */
export function trackToVideoItem(track: Track): VideoItem {
  return {
    id: track.id,
    url: track.url,
    title: track.title,
    artist: track.artist,
  };
}
