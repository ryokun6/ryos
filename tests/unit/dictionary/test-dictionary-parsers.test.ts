#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  extractFirstTarFile,
  formatCedictLine,
  jmdictWordToEntry,
  parseCedict,
  parseCedictLine,
  parseKanjidic,
  parseKengdic,
  shortenJmdictTag,
} from "../../../api/dictionary/_helpers/_parsers";
import {
  parseDatamuseResponse,
  parseFreeDictionaryResponse,
  parseWiktionaryResponse,
  stripHtml,
} from "../../../api/dictionary/_helpers/_remote";
import { glossKeys } from "../../../api/dictionary/_helpers/_index";

describe("CC-CEDICT", () => {
  test("parses a line into an entry with both scripts and numbered pinyin", () => {
    const entry = parseCedictLine("學習 学习 [xue2 xi2] /to learn/to study/CL:個|个[ge4]/");
    expect(entry).toEqual({
      id: "cc-cedict:學習:xue2_xi2",
      lang: "zh",
      headword: "学习",
      traditional: "學習",
      simplified: "学习",
      reading: "xue2 xi2",
      senses: [{ glosses: ["to learn", "to study"], notes: ["CL:個|个[ge4]"] }],
      source: "cc-cedict",
    });
  });

  test("skips comments and malformed lines", () => {
    const text = "# CC-CEDICT\n#! version=1\nnot a line\n中國 中国 [Zhong1 guo2] /China/\r\n";
    const entries = parseCedict(text);
    expect(entries).toHaveLength(1);
    expect(entries[0].headword).toBe("中国");
  });

  test("round-trips through the compact row format", () => {
    const line = "銀行 银行 [yin2 hang2] /bank/CL:家[jia1],個|个[ge4]/";
    expect(formatCedictLine(parseCedictLine(line)!)).toBe(line);
  });
});

describe("JMdict", () => {
  const tags = { n: "noun (common) (futsuumeishi)", "vs": "noun or participle which takes the aux. verb suru" };

  test("maps a word to an entry with reading, alternates, and tags", () => {
    const entry = jmdictWordToEntry(
      {
        id: "1403840",
        kanji: [
          { common: true, text: "勉強" },
          { text: "勉彊" },
        ],
        kana: [{ common: true, text: "べんきょう" }],
        sense: [
          {
            partOfSpeech: ["n", "vs"],
            related: [["学習"]],
            antonym: [],
            gloss: [{ lang: "eng", text: "study" }, { lang: "ger", text: "Lernen" }],
          },
          { misc: ["n"], gloss: [] },
        ],
      },
      tags
    );
    expect(entry).toEqual({
      id: "jmdict:1403840",
      lang: "ja",
      headword: "勉強",
      reading: "べんきょう",
      alternates: ["勉彊"],
      senses: [
        {
          glosses: ["study"],
          partOfSpeech: "noun, suru verb",
          synonyms: ["学習"],
        },
      ],
      tags: ["common"],
      source: "jmdict",
    });
  });

  test("kana-only words use the kana as headword without a reading", () => {
    const entry = jmdictWordToEntry({
      id: "1",
      kanji: [],
      kana: [{ text: "これ" }],
      sense: [{ gloss: [{ text: "this" }] }],
    });
    expect(entry?.headword).toBe("これ");
    expect(entry?.reading).toBeUndefined();
    expect(entry?.tags).toBeUndefined();
  });

  test("shortens tag descriptions", () => {
    expect(shortenJmdictTag("n", tags)).toBe("noun");
    expect(shortenJmdictTag("unknown", tags)).toBe("unknown");
    expect(shortenJmdictTag("vs", tags)).toBe("suru verb");
    expect(shortenJmdictTag("v5r")).toBe("godan verb");
    expect(shortenJmdictTag("arch", { arch: "archaic (rare)" })).toBe("archaic");
  });
});

describe("KANJIDIC2", () => {
  test("extracts readings, meanings, strokes, and JLPT level", () => {
    const map = parseKanjidic({
      characters: [
        {
          literal: "学",
          misc: { grade: 1, strokeCounts: [8], frequency: 63, jlptLevel: 4 },
          readingMeaning: {
            groups: [
              {
                readings: [
                  { type: "pinyin", value: "xue2" },
                  { type: "ja_on", value: "ガク" },
                  { type: "ja_kun", value: "まな.ぶ" },
                ],
                meanings: [{ value: "study" }, { lang: "fr", value: "étude" }, { value: "learning" }],
              },
            ],
          },
        },
      ],
    });
    expect(map.get("学")).toEqual({
      literal: "学",
      meanings: ["study", "learning"],
      onyomi: ["ガク"],
      kunyomi: ["まな.ぶ"],
      strokeCount: 8,
      grade: 1,
      jlpt: 4,
      frequency: 63,
    });
  });
});

describe("kengdic", () => {
  test("groups duplicate surface + hanja rows and keeps the level tag", () => {
    const tsv = [
      "id\tsurface\thanja\tgloss\tlevel\tcreated\tsource",
      "1\t사랑\t\tlove\tA\t\t",
      "2\t사랑\t\tLove\t\t\t",
      "3\t사랑\t\taffection\t\t\t",
      "4\t학교\t學校\tschool\tA\t\t",
    ].join("\n");
    const entries = parseKengdic(tsv);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: "kengdic:1",
      headword: "사랑",
      senses: [{ glosses: ["love", "affection"] }],
      tags: ["level-a"],
    });
    expect(entries[1]).toMatchObject({ headword: "학교", hanja: "學校" });
  });
});

describe("tar extraction", () => {
  test("returns the first regular file in an archive", () => {
    const content = new TextEncoder().encode('{"ok":true}');
    const header = new Uint8Array(512);
    header.set(new TextEncoder().encode("data.json"), 0);
    header.set(new TextEncoder().encode(content.length.toString(8).padStart(11, "0")), 124);
    header[156] = "0".charCodeAt(0);
    const body = new Uint8Array(512);
    body.set(content);
    const tar = new Uint8Array([...header, ...body, ...new Uint8Array(1024)]);
    expect(new TextDecoder().decode(extractFirstTarFile(tar)!)).toBe('{"ok":true}');
    expect(extractFirstTarFile(new Uint8Array(1024))).toBeNull();
  });
});

describe("gloss keys", () => {
  test("splits glosses into short reverse-lookup keys", () => {
    expect(glossKeys("to learn; to study")).toEqual(["learn", "study"]);
    expect(glossKeys("bank (financial institution)")).toEqual(["bank"]);
    expect(glossKeys("variant of 學|学[xue2]")).toEqual([]);
  });
});

describe("remote dictionary parsers", () => {
  test("Free Dictionary: senses, examples, synonyms, IPA, https audio only", () => {
    const entry = parseFreeDictionaryResponse([
      {
        word: "happy",
        phonetics: [{ text: "/ˈhæpi/", audio: "https://example.com/happy.mp3" }],
        meanings: [
          {
            partOfSpeech: "adjective",
            definitions: [
              { definition: "Feeling joy.", example: "A happy child.", synonyms: ["glad"] },
              { definition: "Fortunate.", antonyms: ["unlucky"] },
            ],
            synonyms: ["cheerful", "glad"],
          },
        ],
      },
    ]);
    expect(entry).toEqual({
      id: "free-dictionary:happy",
      lang: "en",
      headword: "happy",
      ipa: "/ˈhæpi/",
      audioUrl: "https://example.com/happy.mp3",
      senses: [
        {
          partOfSpeech: "adjective",
          glosses: ["Feeling joy.", "Fortunate."],
          examples: [{ text: "A happy child." }],
          synonyms: ["cheerful", "glad"],
          antonyms: ["unlucky"],
        },
      ],
      synonyms: ["cheerful", "glad"],
      source: "free-dictionary",
    });
    expect(parseFreeDictionaryResponse({ title: "No Definitions Found" })).toBeNull();
  });

  test("Datamuse: unique words only", () => {
    expect(parseDatamuseResponse([{ word: "glad" }, { word: "glad" }, { score: 1 }, null])).toEqual([
      "glad",
    ]);
  });

  test("Wiktionary: strips HTML and turns inline readings into furigana", () => {
    const entry = parseWiktionaryResponse(
      {
        ja: [
          {
            partOfSpeech: "Verb",
            definitions: [
              {
                definition: "to <a href='x'>study</a>",
                parsedExamples: [
                  {
                    example: "<b>学校(がっこう)</b>で勉強(べんきょう)する",
                    translation: "study at school",
                  },
                ],
              },
            ],
          },
        ],
        en: [{ definitions: [{ definition: "ignored" }] }],
      },
      "ja",
      "勉強"
    );
    expect(entry?.senses).toEqual([
      {
        partOfSpeech: "verb",
        glosses: ["to study"],
        examples: [
          {
            text: "学校で勉強する",
            furigana: [
              { text: "学校", reading: "がっこう" },
              { text: "で" },
              { text: "勉強", reading: "べんきょう" },
              { text: "する" },
            ],
            translation: "study at school",
          },
        ],
      },
    ]);
    expect(parseWiktionaryResponse({ en: [] }, "ko", "사랑")).toBeNull();

    const zh = parseWiktionaryResponse(
      {
        zh: [
          {
            partOfSpeech: "Verb",
            definitions: [
              {
                definition: "to learn",
                examples: ["刻苦學習／刻苦学习 ― <i>kèkǔ xuéxí</i> ― to study hard"],
              },
            ],
          },
        ],
      },
      "zh",
      "學習"
    );
    expect(zh?.senses[0].examples).toEqual([
      { text: "刻苦学习", reading: "kèkǔ xuéxí", translation: "to study hard" },
    ]);
    expect(stripHtml("a&nbsp;<i>b</i> &amp; c")).toBe("a b & c");
  });

  test("Wiktionary: dedupes glosses and treats transliteration-only translations as readings", () => {
    const entry = parseWiktionaryResponse(
      {
        ja: [
          {
            partOfSpeech: "Noun",
            definitions: [
              {
                definition: "studying",
                parsedExamples: [
                  {
                    example: "成績(せいせき)のため",
                    translation:
                      '<i><span class="e-transliteration tr">seiseki no tame</span></i>',
                  },
                ],
              },
              { definition: "Studying" },
            ],
          },
        ],
      },
      "ja",
      "勉強"
    );
    expect(entry?.senses[0].glosses).toEqual(["studying"]);
    const example = entry?.senses[0].examples?.[0];
    expect(example?.translation).toBeUndefined();
    expect(example?.reading).toBe("seiseki no tame");
  });
});
