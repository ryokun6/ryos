export interface LyricsSource {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
}

export type LibrarySource = "youtube" | "appleMusic";

export interface AppleMusicPlayParams {
  catalogId?: string;
  libraryId?: string;
  stationId?: string;
  playlistId?: string;
  kind: string;
  isLibrary?: boolean;
}

export interface Track {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  appleMusicAlbumId?: string;
  cover?: string;
  coverColor?: string;
  lyricOffset?: number;
  lyricsSource?: LyricsSource;
  createdAt?: number;
  importOrder?: number;
  updatedAt?: number;
  source?: LibrarySource;
  durationMs?: number;
  appleMusicPlayParams?: AppleMusicPlayParams;
}

export interface TrackSortFields {
  id: string;
  createdAt?: number;
  updatedAt?: number;
  importOrder?: number;
}

export function sortTracksLikeServerOrder<T extends TrackSortFields>(
  tracks: T[]
): T[] {
  const indexById = new Map(tracks.map((track, index) => [track.id, index]));
  return [...tracks].sort((a, b) => {
    const createdAtDiff = (b.createdAt ?? 0) - (a.createdAt ?? 0);
    if (createdAtDiff !== 0) return createdAtDiff;
    const importDiff =
      (a.importOrder ?? Number.POSITIVE_INFINITY) -
      (b.importOrder ?? Number.POSITIVE_INFINITY);
    if (importDiff !== 0) return importDiff;
    const updatedAtDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    if (updatedAtDiff !== 0) return updatedAtDiff;
    return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0);
  });
}
