import { describe, expect, test } from "bun:test";
import { buildLyricsPlaybackInput } from "../src/shared/media/lyricsPlaybackInput";

describe("buildLyricsPlaybackInput", () => {
  test("builds useLyrics-compatible input with offset and romanization flags", () => {
    expect(
      buildLyricsPlaybackInput({
        track: {
          id: "song-1",
          title: "Song",
          artist: "Artist",
          lyricOffset: 500,
          lyricsSource: { title: "Alt Song", artist: "Alt Artist" },
        },
        elapsedTimeSec: 10,
        effectiveTranslationLanguage: "en",
        uiLanguage: "zh-CN",
        romanization: {
          enabled: true,
          japaneseFurigana: true,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          chineseLyricsLanguage: "auto",
          soramimi: true,
          soramamiTargetLanguage: "en",
        },
      })
    ).toEqual({
      songId: "song-1",
      title: "Song",
      artist: "Artist",
      currentTimeSec: 10.5,
      translateTo: "en",
      lyricsLanguage: "zh-CN",
      selectedMatch: { title: "Alt Song", artist: "Alt Artist" },
      includeFurigana: true,
      includeSoramimi: true,
    });
  });
});
