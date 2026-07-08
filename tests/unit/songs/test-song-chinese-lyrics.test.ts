import { describe, expect, test } from "bun:test";
import type { Redis } from "@upstash/redis";
import {
  buildChineseLyricsVariants,
  buildChineseTextVariants,
  buildChineseTranslationVariantsFromKrc,
  getChineseLyricsLanguage,
  parseLyricsContent,
} from "../../../api/songs/_lyrics";
import {
  getSong,
  saveLyrics,
  saveTranslations,
} from "../../../api/_utils/_song-service";
import { FetchLyricsSchema } from "../../../api/songs/_constants";
import { FakeRedis } from "../../helpers/fake-redis";

const simplifiedKrc =
  "[1000,2000]<0,500,0>头发<500,500,0>里面<1000,500,0>看着<1500,500,0>中国";

function krcWithEmbeddedChinese(text: string): string {
  const language = Buffer.from(
    JSON.stringify({
      content: [{ lyricContent: [[text]], type: 1, language: 0 }],
      version: 1,
    })
  ).toString("base64");
  return [
    `[language:${language}]`,
    "[1000,2000]<0,1000,0>사랑<1000,1000,0>해",
  ].join("\n");
}

describe("Chinese lyric script variants", () => {
  test("processes KuGou lyrics into Simplified and Traditional lines", () => {
    const variants = buildChineseLyricsVariants({ krc: simplifiedKrc });

    expect(variants["zh-CN"][0]?.words).toBe("头发里面看着中国");
    expect(variants["zh-TW"][0]?.words).toBe("頭髮裡面看著中國");
    expect(variants["zh-CN"][0]?.wordTimings?.[0]?.text).toBe("头发");
    expect(variants["zh-TW"][0]?.wordTimings?.[0]?.text).toBe("頭髮");
  });

  test("does not convert Japanese Kanji when Kana is present", () => {
    const lyrics = { lrc: "[00:01.00]気持ち" };

    expect(parseLyricsContent(lyrics, undefined, undefined, "zh-CN")[0]?.words).toBe(
      "気持ち"
    );
    expect(parseLyricsContent(lyrics, undefined, undefined, "zh-TW")[0]?.words).toBe(
      "気持ち"
    );
  });

  test("builds both scripts from embedded KuGou Chinese translations", () => {
    const variants = buildChineseTranslationVariantsFromKrc({
      lrc: "[00:01.00]사랑해",
      krc: krcWithEmbeddedChinese("头发里面"),
    });

    expect(variants["zh-CN"]).toBe("[00:01.00]头发里面");
    expect(variants["zh-TW"]).toBe("[00:01.00]頭髮裡面");
  });

  test("recognizes Chinese script aliases", () => {
    expect(getChineseLyricsLanguage("zh-Hant")).toBe("zh-TW");
    expect(getChineseLyricsLanguage("繁體中文")).toBe("zh-TW");
    expect(getChineseLyricsLanguage("zh-Hans")).toBe("zh-CN");
    expect(getChineseLyricsLanguage("简体中文")).toBe("zh-CN");
    expect(getChineseLyricsLanguage("ja")).toBeNull();
  });

  test("validates the requested primary lyric language", () => {
    expect(
      FetchLyricsSchema.safeParse({
        action: "fetch-lyrics",
        lyricsLanguage: "zh-CN",
      }).success
    ).toBe(true);
    expect(
      FetchLyricsSchema.safeParse({
        action: "fetch-lyrics",
        lyricsLanguage: "zh-HK",
      }).success
    ).toBe(false);
  });
});

describe("Chinese lyric persistence", () => {
  test("stores raw KuGou lyrics and both processed lyric and translation scripts", async () => {
    const redis = new FakeRedis();
    const redisClient = redis as unknown as Redis;
    const parsedLinesByLanguage = buildChineseLyricsVariants({
      krc: simplifiedKrc,
    });

    await saveLyrics(redisClient, "song_chinese_variants", {
      lrc: "[00:01.00]头发里面看着中国",
      krc: simplifiedKrc,
      parsedLinesByLanguage,
    });
    await saveTranslations(
      redisClient,
      "song_chinese_variants",
      buildChineseTextVariants("[00:01.00]头发里面")
    );

    const stored = await getSong(redisClient, "song_chinese_variants", {
      includeLyrics: true,
      includeTranslations: true,
    });

    expect(stored?.lyrics?.lrc).toContain("头发里面");
    expect(stored?.lyrics?.parsedLinesByLanguage?.["zh-CN"]?.[0]?.words).toBe(
      "头发里面看着中国"
    );
    expect(stored?.lyrics?.parsedLinesByLanguage?.["zh-TW"]?.[0]?.words).toBe(
      "頭髮裡面看著中國"
    );
    expect(stored?.translations?.["zh-CN"]).toContain("头发里面");
    expect(stored?.translations?.["zh-TW"]).toContain("頭髮裡面");
  });
});
