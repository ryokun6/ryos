import type { CachedLyricsSource } from "@/utils/songMetadataCache";

export interface FuriganaSegment {
  text: string;
  reading?: string;
}

export interface SongDetail {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  coverColor?: string;
  lyricOffset?: number;
  lyricsSource?: CachedLyricsSource;
  lyrics?: {
    lrc?: string;
    krc?: string;
    parsedLines?: Array<{ words: string; startTimeMs: string }>;
  };
  translations?: Record<string, string>;
  furigana?: FuriganaSegment[][];
  soramimi?: FuriganaSegment[][];
  soramimiByLang?: Record<string, FuriganaSegment[][]>;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SongDetailPanelProps {
  youtubeId: string;
  onBack: () => void;
  onSongDeleted: () => void;
}
