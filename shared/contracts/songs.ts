/**
 * Shared song / lyrics contracts
 */

/** Lyrics source information from Kugou */
export interface LyricsSource {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
}

/** Word-level timing from KRC format */
export interface WordTiming {
  text: string;
  startTimeMs: number;
  durationMs: number;
}

/** Parsed lyric line (filtered and normalized) */
export interface LyricLine {
  startTimeMs: string;
  words: string;
  wordTimings?: WordTiming[];
}

/** Song metadata stored in song:meta:{id} */
export interface SongMetadata {
  id: string; // YouTube video ID
  title: string;
  artist?: string;
  album?: string;
  cover?: string; // Cover image URL (from Kugou)
  coverColor?: string; // Cached boosted cover color for lyrics/title glow
  lyricOffset?: number; // Offset in ms to adjust lyrics timing
  lyricsSource?: LyricsSource;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  importOrder?: number; // For stable sorting during bulk imports
}
