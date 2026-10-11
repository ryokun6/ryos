import { describe, expect, test } from "bun:test";

import {
  decodeAnnotatedSegments,
  decodeHtmlEntitiesOnce,
  decodeLyricText,
} from "../../../api/_utils/html-entities";
import { presentFuriganaSegments, normalizeFuriganaSegments } from "../../../api/songs/_furigana";
import { presentKugouNames } from "../../../api/songs/_kugou";
import {
  buildChineseTranslationFromKrc,
  decodeLrcDocument,
  decodeLyricsSource,
  decodeParsedLyricLines,
  filterLrcCreditLines,
  parseKrcToLines,
  parseLrcToLines,
  parseLyricsContent,
} from "../../../api/songs/_lyrics";

describe("decodeLyricText", () => {
  test("decodes named, decimal, and hex apostrophes once", () => {
    expect(decodeLyricText("I&apos;m gonna have")).toBe("I'm gonna have");
    expect(decodeLyricText("I&#39;m gonna have")).toBe("I'm gonna have");
    expect(decodeLyricText("I&#x27;m gonna have")).toBe("I'm gonna have");
    expect(decodeLyricText("I&#X27;m gonna have")).toBe("I'm gonna have");
    expect(decodeLyricText("&APOS;")).toBe("'");
  });

  test("decodes amp, quot, lt, gt, and nbsp", () => {
    expect(decodeLyricText("rock &amp; roll")).toBe("rock & roll");
    expect(decodeLyricText("&quot;소주&quot;")).toBe('"소주"');
    expect(decodeLyricText("&lt;tag&gt;")).toBe("<tag>");
    expect(decodeLyricText("a&nbsp;glass")).toBe("a glass");
  });

  test("decodes mixed CJK around entities without treating the line as HTML", () => {
    expect(decodeLyricText("취하지 &apos;않을 정도만")).toBe("취하지 '않을 정도만");
    expect(decodeLyricText("a glass of &#xC18C;&#xC8FC;")).toBe("a glass of 소주");
    expect(decodeLyricText("我想要喝杯&quot;烧酒&quot;")).toBe('我想要喝杯"烧酒"');
    expect(decodeHtmlEntitiesOnce("<b>I&apos;m</b>")).toBe("<b>I'm</b>");
  });

  test("does not double-decode", () => {
    expect(decodeLyricText("&amp;amp;")).toBe("&amp;");
    expect(decodeLyricText("&amp;apos;")).toBe("&apos;");
    expect(decodeLyricText("&amp;lt;")).toBe("&lt;");
    expect(decodeLyricText("&amp;quot;")).toBe("&quot;");
    expect(decodeLyricText("I&#39;m")).toBe("I'm");
    expect(decodeLyricText("I'm gonna have")).toBe("I'm gonna have");
  });

  test("leaves invalid code points untouched", () => {
    expect(decodeLyricText("&#xD800;")).toBe("&#xD800;");
    expect(decodeLyricText("&#x110000;")).toBe("&#x110000;");
    expect(decodeLyricText("&#999999999;")).toBe("&#999999999;");
  });
});

describe("lyric parsers decode entities once from the provider payload", () => {
  test("parses the screenshot line from LRC", () => {
    const lines = parseLrcToLines(
      [
        "[00:10.00]취하지 않을 정도만",
        "[00:12.00]I&apos;m gonna have",
        "[00:14.00]a glass of 소주",
      ].join("\n"),
    );

    expect(lines.map((line) => line.words)).toEqual([
      "취하지 않을 정도만",
      "I'm gonna have",
      "a glass of 소주",
    ]);
  });

  test("parses decimal, hex, amp, and quot entities in LRC and KRC", () => {
    const lrc = parseLrcToLines(
      [
        "[00:01.00]I&#39;m",
        "[00:02.00]I&#x27;m",
        "[00:03.00]rock &amp; roll",
        "[00:04.00]&quot;소주&quot;",
        "[00:05.00]취하지 &apos;않을",
      ].join("\n"),
    );
    expect(lrc.map((line) => line.words)).toEqual([
      "I'm",
      "I'm",
      "rock & roll",
      '"소주"',
      "취하지 '않을",
    ]);

    const krc = parseKrcToLines(
      [
        "[12000,2000]<0,200,0>I&apos;m <200,400,0>gonna <600,400,0>have",
        "[14000,1500]<0,400,0>a glass of <400,400,0>&#xC18C;&#xC8FC;",
        "[16000,1000]<0,1000,0>rock &amp;amp; roll",
      ].join("\n"),
    );

    expect(krc[0]).toEqual({
      startTimeMs: "12000",
      words: "I'm gonna have",
      wordTimings: [
        { text: "I'm ", startTimeMs: 0, durationMs: 200 },
        { text: "gonna ", startTimeMs: 200, durationMs: 400 },
        { text: "have", startTimeMs: 600, durationMs: 400 },
      ],
    });
    expect(krc[1].words).toBe("a glass of 소주");
    expect(krc[1].wordTimings?.[1]?.text).toBe("소주");
    expect(krc[2].words).toBe("rock &amp; roll");
  });

  test("re-parsing the stored payload does not decode a second time", () => {
    const raw = "[00:01.00]rock &amp;amp; roll &amp;apos;live&amp;apos;";
    const first = parseLrcToLines(raw)[0]?.words;
    const second = parseLrcToLines(raw)[0]?.words;
    expect(first).toBe("rock &amp; roll &apos;live&apos;");
    expect(second).toBe(first);

    const viaContent = parseLyricsContent({ lrc: raw });
    expect(viaContent[0]?.words).toBe(first);
  });

  test("skips a title line when the provider title is still encoded", () => {
    const lines = parseLrcToLines(
      ["[00:01.00]I&apos;m Yours - Artist", "[00:02.00]I&#x27;m gonna have"].join(
        "\n",
      ),
      "I&apos;m Yours",
      "Artist",
    );
    expect(lines.map((line) => line.words)).toEqual(["I'm gonna have"]);
  });
});

describe("cached lyric derivatives decode on read", () => {
  test("decodes translation LRC text and still drops credit lines", () => {
    const raw = [
      "[00:00.00]Lyrics: Wu Junlin",
      "[00:12.00]I&apos;m gonna have",
      "[00:14.00]a glass of &quot;소주&quot;",
      "[00:16.00]rock &amp;amp; roll",
    ].join("\n");

    expect(filterLrcCreditLines(raw)).toBe(
      [
        "[00:12.00]I'm gonna have",
        '[00:14.00]a glass of "소주"',
        "[00:16.00]rock &amp; roll",
      ].join("\n"),
    );
  });

  test("decodeLrcDocument keeps every line and decodes text once", () => {
    const raw = [
      "[ar:THAMA &amp; 주영]",
      "[00:12.00]I&#39;m gonna have",
      "plain &quot;소주&quot;",
    ].join("\n");

    expect(decodeLrcDocument(raw)).toBe(
      ['[ar:THAMA & 주영]', "[00:12.00]I'm gonna have", 'plain "소주"'].join(
        "\n",
      ),
    );
    expect(decodeLrcDocument("[00:01.00]I'm gonna have")).toBe(
      "[00:01.00]I'm gonna have",
    );
  });

  test("decodes cached parsed lines and metadata without rewriting clean values", () => {
    const encoded = [
      {
        startTimeMs: "0",
        words: "I&apos;m gonna have",
        wordTimings: [{ text: "I&#x27;m" }],
      },
    ];
    const decoded = decodeParsedLyricLines(encoded);
    expect(decoded[0]?.words).toBe("I'm gonna have");
    expect(decoded[0]?.wordTimings?.[0]?.text).toBe("I'm");

    const clean = [{ startTimeMs: "0", words: "소주" }];
    expect(decodeParsedLyricLines(clean)).toBe(clean);

    const source = {
      hash: "abc",
      title: "I&apos;m Yours",
      artist: "THAMA &amp; 주영",
      album: "&quot;Questions&quot;",
    };
    expect(decodeLyricsSource(source)).toEqual({
      hash: "abc",
      title: "I'm Yours",
      artist: "THAMA & 주영",
      album: '"Questions"',
    });
    const cleanSource = { title: "Questions", artist: "THAMA" };
    expect(decodeLyricsSource(cleanSource)).toBe(cleanSource);
  });

  test("decodes furigana on read and leaves the save-path normalizer encoded", () => {
    const cached = [
      { text: "I&apos;m", reading: "ai&amp;m" },
      { text: "소주", reading: "soju" },
    ];
    expect(normalizeFuriganaSegments(cached)).toEqual(cached);

    const presented = presentFuriganaSegments(cached);
    expect(presented).toEqual([
      { text: "I'm", reading: "ai&m" },
      { text: "소주", reading: "soju" },
    ]);

    const lyric = parseKrcToLines(
      "[0,1000]<0,400,0>I&apos;m<400,600,0>소주",
    )[0];
    expect(lyric?.words).toBe("I'm소주");
    expect(lyric?.wordTimings?.map((timing) => timing.text).join("")).toBe(
      presented.map((segment) => segment.text).join(""),
    );
  });

  test("annotated segments with no entities keep the same array", () => {
    const segments = [{ text: "소주", reading: "soju" }];
    expect(decodeAnnotatedSegments(segments)).toBe(segments);
  });

  test("Kugou titles and artists decode once, including mixed CJK", () => {
    expect(
      presentKugouNames({
        songname: "Questions (Feat. &#xC8FC;&#xC601;)",
        singername: "THAMA&amp;주영、A",
        album_name: "I&apos;m &amp;amp; me",
      }),
    ).toEqual({
      title: "Questions (Feat. 주영)",
      artist: "THAMA&주영 & A",
      album: "I'm &amp; me",
    });
  });

  test("embedded KRC Chinese stays encoded until the translation is read", () => {
    const language = Buffer.from(
      JSON.stringify({
        content: [
          {
            type: 1,
            lyricContent: [["I&apos;m Yours - Artist"], ["我想要喝杯&quot;烧酒&quot;"]],
          },
        ],
      }),
      "utf8",
    ).toString("base64");
    const krc = [
      `[language:${language}]`,
      "[0,1000]<0,1000,0>I&apos;m Yours - Artist",
      "[1000,1000]<0,1000,0>a glass of 소주",
    ].join("\n");

    const stored = buildChineseTranslationFromKrc(
      { lrc: "", krc },
      "I&apos;m Yours",
      "Artist",
      "zh-CN",
    );
    expect(stored).toBe('[00:01.00]我想要喝杯&quot;烧酒&quot;');
    expect(filterLrcCreditLines(stored ?? "")).toBe('[00:01.00]我想要喝杯"烧酒"');
    expect(decodeLrcDocument(stored ?? "")).toBe('[00:01.00]我想要喝杯"烧酒"');
  });
});
