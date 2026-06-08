import type { RomanizationSettings } from "@/types/lyrics";

export interface LyricsPlaybackTrackInput {
  id: string;
  title: string;
  artist?: string;
  lyricOffset?: number;
  lyricsSource?: {
    title?: string;
    artist?: string;
    albumId?: string;
    hash?: string;
  };
}

export interface LyricsPlaybackInput {
  songId: string;
  title: string;
  artist: string;
  currentTimeSec: number;
  translateTo: string | null;
  selectedMatch?: LyricsPlaybackTrackInput["lyricsSource"];
  includeFurigana: boolean;
  includeSoramimi: boolean;
}

export function buildLyricsPlaybackInput(args: {
  track: LyricsPlaybackTrackInput;
  elapsedTimeSec: number;
  effectiveTranslationLanguage: string | null;
  romanization: RomanizationSettings;
}): LyricsPlaybackInput {
  const lyricOffsetSec = (args.track.lyricOffset ?? 0) / 1000;
  return {
    songId: args.track.id,
    title: args.track.title,
    artist: args.track.artist || "",
    currentTimeSec: args.elapsedTimeSec + lyricOffsetSec,
    translateTo: args.effectiveTranslationLanguage,
    selectedMatch: args.track.lyricsSource,
    includeFurigana:
      args.romanization.enabled &&
      (args.romanization.japaneseFurigana || args.romanization.japaneseRomaji),
    includeSoramimi:
      args.romanization.enabled && Boolean(args.romanization.soramimi),
  };
}
