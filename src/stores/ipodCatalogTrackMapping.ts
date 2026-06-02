import type { Track } from "@/stores/useIpodStore";
import type { CachedSongMetadata } from "@/utils/songMetadataCache";

export function mapCatalogSongToTrack(song: CachedSongMetadata): Track {
  return {
    id: song.youtubeId,
    url: `https://www.youtube.com/watch?v=${song.youtubeId}`,
    title: song.title,
    artist: song.artist,
    album: song.album ?? "",
    cover: song.cover,
    coverColor: song.coverColor,
    lyricOffset: song.lyricOffset,
    lyricsSource: song.lyricsSource,
    createdAt: song.createdAt,
    importOrder: song.importOrder,
    updatedAt: song.updatedAt,
  };
}
