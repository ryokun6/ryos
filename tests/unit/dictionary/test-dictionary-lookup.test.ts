#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  buildChineseIndex,
  buildJapaneseIndex,
  buildKoreanIndex,
} from "../../../api/dictionary/_helpers/_datasets";
import {
  beginDictionaryLookup,
  chooseAutoCjkLanguage,
  lookupDictionary,
  type DictionaryLookupDeps,
} from "../../../api/dictionary/_helpers/_lookup";
import { parseCedict, parseKengdic } from "../../../api/dictionary/_helpers/_parsers";
import { DictionaryIndex } from "../../../api/dictionary/_helpers/_index";
import {
  detectDictionaryLanguage,
  normalizeDictionaryQuery,
  type DictionaryEntry,
  type DictionaryKanjiInfo,
  type DictionaryLanguage,
} from "../../../src/shared/dictionary";

const CEDICT = `
學習 学习 [xue2 xi2] /to learn/to study/
習 习 [xi2] /to practice/habit/
學生 学生 [xue2 sheng5] /student/schoolchild/
學校 学校 [xue2 xiao4] /school/CL:所[suo3]/
學 学 [xue2] /to learn/to study/science/-ology/
銀行 银行 [yin2 hang2] /bank/CL:家[jia1]/
銀 银 [yin2] /silver/
行 行 [xing2] /to walk/to go/capable/
行 行 [hang2] /row/profession/
中國 中国 [Zhong1 guo2] /China/
中文 中文 [Zhong1 wen2] /Chinese language/
我 我 [wo3] /I/me/my/
愛 爱 [ai4] /to love/affection/
你 你 [ni3] /you (informal)/
讀書 读书 [du2 shu1] /to read a book/to study/
大 大 [da4] /big/large/
大 大 [dai4] /doctor/
大一統 大一统 [da4 yi1 tong3] /unification/
大丈夫 大丈夫 [da4 zhang4 fu5] /a true man/
偉大 伟大 [wei3 da4] /great/
`;

function jaEntry(
  id: string,
  headword: string,
  reading: string | undefined,
  glosses: string[],
  common = true
): DictionaryEntry {
  return {
    id: `jmdict:${id}`,
    lang: "ja",
    headword,
    ...(reading ? { reading } : {}),
    senses: [{ glosses }],
    ...(common ? { tags: ["common"] } : {}),
    source: "jmdict",
  };
}

const JMDICT: DictionaryEntry[] = [
  jaEntry("1", "勉強", "べんきょう", ["study"]),
  jaEntry("2", "食べる", "たべる", ["to eat"]),
  jaEntry("3", "勉強会", "べんきょうかい", ["study meeting"], false),
  jaEntry("4", "学習", "がくしゅう", ["study", "learning"]),
  jaEntry("5", "コーヒー", undefined, ["coffee"]),
];

const KENGDIC = [
  "1\t사랑\t\tlove\tA\t\t",
  "2\t학교\t學校\tschool\tA\t\t",
  "3\t사랑하다\t\tto love\tB\t\t",
].join("\n");

const KANJI = new Map<string, DictionaryKanjiInfo>([
  ["勉", { literal: "勉", meanings: ["exertion"], onyomi: ["ベン"], kunyomi: [], strokeCount: 10 }],
  ["強", { literal: "強", meanings: ["strong"], onyomi: ["キョウ"], kunyomi: ["つよ.い"] }],
]);

const indexes: Record<Exclude<DictionaryLanguage, "en">, DictionaryIndex> = {
  zh: buildChineseIndex(parseCedict(CEDICT)),
  ja: buildJapaneseIndex(JMDICT),
  ko: buildKoreanIndex(parseKengdic(KENGDIC)),
};

function makeDeps(overrides: Partial<DictionaryLookupDeps> = {}): DictionaryLookupDeps {
  return {
    getIndex: async (lang) => {
      if (lang === "en") throw new Error("no local english");
      return indexes[lang];
    },
    getKanjiInfo: async () => KANJI,
    fetchFreeDictionary: async () => null,
    fetchSynonyms: async () => [],
    fetchWiktionary: async () => null,
    ...overrides,
  };
}

const headwords = (entries: DictionaryEntry[]) => entries.map((entry) => entry.headword);

describe("language detection", () => {
  test("detects scripts and respects an explicit choice", () => {
    expect(detectDictionaryLanguage("学习")).toBe("zh");
    expect(detectDictionaryLanguage("食べる")).toBe("ja");
    expect(detectDictionaryLanguage("べんきょう")).toBe("ja");
    expect(detectDictionaryLanguage("사랑")).toBe("ko");
    expect(detectDictionaryLanguage("hello")).toBe("en");
    expect(detectDictionaryLanguage("xuexi", "zh")).toBe("zh");
  });

  test("normalizes whitespace and full-width characters", () => {
    expect(normalizeDictionaryQuery("  ｈｅｌｌｏ   world ")).toBe("hello world");
    expect(normalizeDictionaryQuery("ｶﾀｶﾅ")).toBe("カタカナ");
  });
});

describe("Chinese lookup", () => {
  test("finds hanzi headwords in either script", async () => {
    const simplified = await lookupDictionary("学习", "auto", makeDeps());
    expect(simplified.lang).toBe("zh");
    expect(simplified.notFound).toBe(false);
    expect(simplified.entries[0]).toMatchObject({ headword: "学习", traditional: "學習" });
    expect(simplified.sources).toContain("cc-cedict");

    const traditional = await lookupDictionary("學習", "auto", makeDeps());
    expect(traditional.entries[0].headword).toBe("学习");
  });

  test("attaches per-character CC-CEDICT cards, matching the word's reading", async () => {
    const learned = await lookupDictionary("学习", "zh", makeDeps());
    expect(learned.entries[0].hanzi).toEqual([
      { simplified: "学", traditional: "學", reading: "xue2", meaning: "to learn" },
      { simplified: "习", traditional: "習", reading: "xi2", meaning: "to practice" },
    ]);

    const bank = await lookupDictionary("银行", "zh", makeDeps());
    expect(bank.entries[0].hanzi).toEqual([
      { simplified: "银", traditional: "銀", reading: "yin2", meaning: "silver" },
      { simplified: "行", traditional: "行", reading: "hang2", meaning: "row" },
    ]);

    const big = await lookupDictionary("大", "zh", makeDeps());
    const byReading = Object.fromEntries(
      big.entries
        .filter((entry) => entry.headword === "大" && entry.reading)
        .map((entry) => [entry.reading, entry.hanzi?.[0]?.meaning])
    );
    expect(byReading.da4).toBe("big");
    expect(byReading.dai4).toBe("doctor");
  });

  test("finds words by toneless or tone-marked pinyin", async () => {
    expect(headwords((await lookupDictionary("xuexi", "zh", makeDeps())).entries)).toEqual(["学习"]);
    expect(headwords((await lookupDictionary("xué xí", "zh", makeDeps())).entries)).toEqual([
      "学习",
    ]);
  });

  test("reverse-looks-up English meanings", async () => {
    const result = await lookupDictionary("study", "zh", makeDeps());
    expect(headwords(result.entries)).toEqual(expect.arrayContaining(["学习", "学", "读书"]));
  });

  test("lists compounds and similar words for the top entry", async () => {
    const result = await lookupDictionary("学", "zh", makeDeps());
    expect(headwords(result.entries)).toEqual(["学", "学习", "学生", "学校"]);
    expect(headwords((await lookupDictionary("學", "zh", makeDeps())).entries)).toEqual([
      "学",
      "学习",
      "学生",
      "学校",
    ]);
    expect(headwords(result.phrases)).toEqual(expect.arrayContaining(["学习", "学生", "学校"]));
    expect(headwords(result.similar)).toEqual(expect.arrayContaining(["学习", "读书"]));
  });

  test("includes prefix compounds in the results list", async () => {
    const result = await lookupDictionary("大", "zh", makeDeps());
    expect(headwords(result.entries)).toEqual(["大", "大", "大一统", "大丈夫"]);
    expect(headwords(result.entries)).not.toContain("伟大");
    expect(headwords(result.phrases)).toEqual(expect.arrayContaining(["大一统", "伟大"]));
  });

  test("segments sentences into dictionary words", async () => {
    const result = await lookupDictionary("我爱中国", "auto", makeDeps());
    expect(headwords(result.entries)).toEqual(["我", "爱", "中国"]);
  });

  test("adds Wiktionary examples to the top entry", async () => {
    const result = await lookupDictionary(
      "学习",
      "auto",
      makeDeps({
        fetchWiktionary: async (headword, lang) => ({
          id: `wiktionary:${lang}:${headword}`,
          lang,
          headword,
          senses: [{ glosses: ["to study"], examples: [{ text: "我们学习中文。", translation: "We study Chinese." }] }],
          source: "wiktionary",
        }),
      })
    );
    expect(result.entries[0].senses[0].examples).toEqual([
      { text: "我们学习中文。", translation: "We study Chinese." },
    ]);
    expect(result.sources).toEqual(["cc-cedict", "wiktionary"]);
  });

  test("reports suggestions when nothing matches", async () => {
    const result = await lookupDictionary("学霸", "auto", makeDeps());
    expect(result.notFound).toBe(false);
    const miss = await lookupDictionary("龘", "auto", makeDeps());
    expect(miss.notFound).toBe(true);
    expect(miss.entries).toEqual([]);
  });
});

describe("Japanese lookup", () => {
  test("auto mode falls back to Japanese for kanji words missing from CC-CEDICT", async () => {
    const result = await lookupDictionary("学習", "auto", makeDeps());
    expect(result.lang).toBe("ja");
    expect(result.entries[0]).toMatchObject({ headword: "学習", reading: "がくしゅう" });
    // An explicit Chinese choice does not fall back. 習 is a character entry, so
    // the query segments instead of returning the Japanese word.
    const chinese = await lookupDictionary("学習", "zh", makeDeps());
    expect(chinese.lang).toBe("zh");
    expect(headwords(chinese.entries)).toEqual(["学", "习"]);
  });

  test("finds kanji words and attaches KANJIDIC2 info", async () => {
    const result = await lookupDictionary("勉強", "ja", makeDeps());
    expect(result.lang).toBe("ja");
    expect(result.entries[0]).toMatchObject({ headword: "勉強", reading: "べんきょう" });
    expect(result.entries[0].kanji?.map((k) => k.literal)).toEqual(["勉", "強"]);
    expect(result.entries[0].hanzi).toBeUndefined();
    expect(result.sources).toEqual(["jmdict", "kanjidic2"]);
    expect(headwords(result.phrases)).toContain("勉強会");
  });

  test("finds words by kana and by romaji", async () => {
    expect(headwords((await lookupDictionary("たべる", "auto", makeDeps())).entries)).toEqual([
      "食べる",
    ]);
    expect(headwords((await lookupDictionary("taberu", "ja", makeDeps())).entries)).toEqual([
      "食べる",
    ]);
  });

  test("ranks common words first in English reverse lookup", async () => {
    const result = await lookupDictionary("study", "ja", makeDeps());
    expect(headwords(result.entries).slice(0, 2).sort()).toEqual(["勉強", "学習"]);
  });
});

describe("Korean lookup", () => {
  test("finds Hangul and hanja spellings", async () => {
    expect((await lookupDictionary("사랑", "auto", makeDeps())).entries[0].headword).toBe("사랑");
    const hanja = await lookupDictionary("學校", "ko", makeDeps());
    expect(hanja.entries[0]).toMatchObject({ headword: "학교", hanja: "學校" });
  });

  test("merges kengdic and Wiktionary for the same word into one entry", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = await beginDictionaryLookup(
      "학교",
      "ko",
      makeDeps({
        fetchWiktionary: async (headword, lang) => {
          await gate;
          return {
            id: `wiktionary:${lang}:${headword}`,
            lang,
            headword,
            senses: [
              {
                partOfSpeech: "noun",
                glosses: ["school"],
                examples: [{ text: "학교에 가요", translation: "I go to school" }],
              },
            ],
            source: "wiktionary",
          };
        },
      })
    );
    expect(pending.enrichmentPending).toBe(true);
    expect(pending.local.entries.map((entry) => entry.headword)).toEqual(["학교"]);
    const localId = pending.local.entries[0].id;
    release?.();
    const result = await pending.final;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      id: localId,
      headword: "학교",
      hanja: "學校",
      source: "kengdic",
      senses: [
        {
          partOfSpeech: "noun",
          glosses: ["school"],
          examples: [{ text: "학교에 가요", translation: "I go to school" }],
        },
      ],
    });
    expect(result.sources).toEqual(["kengdic", "wiktionary"]);
  });

  test("keeps Korean homographs with different hanja separate", async () => {
    const index = buildKoreanIndex(
      parseKengdic(["1\t배\t梨\tpear\tA\t\t", "2\t배\t船\tship\tA\t\t"].join("\n"))
    );
    const result = await lookupDictionary(
      "배",
      "ko",
      makeDeps({
        getIndex: async (lang) => {
          if (lang !== "ko") throw new Error(lang);
          return index;
        },
        fetchWiktionary: async (headword, lang) => ({
          id: `wiktionary:${lang}:${headword}`,
          lang,
          headword,
          senses: [
            { partOfSpeech: "noun", glosses: ["pear"] },
            { partOfSpeech: "noun", glosses: ["ship"] },
          ],
          source: "wiktionary",
        }),
      })
    );
    expect(result.entries.map((entry) => entry.hanja)).toEqual(["梨", "船"]);
    expect(result.entries.map((entry) => entry.id)).toEqual(["kengdic:1", "kengdic:2"]);
    expect(result.sources).toEqual(["kengdic"]);
  });
});

describe("auto mode Han choice", () => {
  test("prefers a Japanese whole word, and a ja locale wins ties", () => {
    expect(chooseAutoCjkLanguage(true, true)).toBe("zh");
    expect(chooseAutoCjkLanguage(true, true, "ja")).toBe("ja");
    expect(chooseAutoCjkLanguage(true, true, "ja-JP")).toBe("ja");
    expect(chooseAutoCjkLanguage(false, true, "zh-CN")).toBe("ja");
    expect(chooseAutoCjkLanguage(true, false, "ja")).toBe("zh");
    expect(chooseAutoCjkLanguage(false, false)).toBe("zh");
    expect(chooseAutoCjkLanguage(false, false, "ja")).toBe("ja");
  });

  test("probes both indexes together and keeps the existing whole-word winner", async () => {
    const seen: string[] = [];
    const deps = makeDeps({
      getIndex: async (lang) => {
        seen.push(lang);
        if (lang === "en") throw new Error("no local english");
        return indexes[lang];
      },
    });
    const learned = await beginDictionaryLookup("学习", "auto", deps);
    expect(learned.local.lang).toBe("zh");
    expect(learned.local.wholeWordMatch).toBeUndefined();
    expect(seen).toEqual(["zh", "ja"]);
    seen.length = 0;
    const study = await lookupDictionary("学習", "auto", deps);
    expect(study.lang).toBe("ja");
    expect(study.entries[0].headword).toBe("学習");
  });

  test("ja locale prefers Japanese when both indexes have the word", async () => {
    const japanese = buildJapaneseIndex([
      ...JMDICT,
      jaEntry("bank", "銀行", "ぎんこう", ["bank"]),
    ]);
    const deps = makeDeps({
      getIndex: async (lang) => {
        if (lang === "ja") return japanese;
        if (lang === "en") throw new Error("no local english");
        return indexes[lang];
      },
    });
    const inJapanese = await lookupDictionary("銀行", "auto", deps, { locale: "ja" });
    expect(inJapanese.lang).toBe("ja");
    expect(inJapanese.entries[0].reading).toBe("ぎんこう");
    const inChinese = await lookupDictionary("銀行", "auto", deps, { locale: "en" });
    expect(inChinese.lang).toBe("zh");
    expect(inChinese.entries[0].headword).toBe("银行");
  });

  test("kana skips the Chinese index", async () => {
    const seen: string[] = [];
    const result = await lookupDictionary(
      "たべる",
      "auto",
      makeDeps({
        getIndex: async (lang) => {
          seen.push(lang);
          if (lang === "en") throw new Error("no local english");
          return indexes[lang];
        },
      })
    );
    expect(result.entries[0].headword).toBe("食べる");
    expect(seen).toEqual(["ja"]);
  });
});

describe("non-blocking Wiktionary enrichment", () => {
  test("returns the local entry while Wiktionary is still pending", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let wikiStarted = false;
    const pending = await beginDictionaryLookup(
      "学习",
      "zh",
      makeDeps({
        fetchWiktionary: async () => {
          wikiStarted = true;
          await gate;
          return {
            id: "wiktionary:zh:學習",
            lang: "zh",
            headword: "學習",
            senses: [{ glosses: ["to study"], examples: [{ text: "我们学习中文。" }] }],
            source: "wiktionary",
          };
        },
      })
    );
    expect(wikiStarted).toBe(true);
    expect(pending.enrichmentPending).toBe(true);
    expect(pending.local.sources).toEqual(["cc-cedict"]);
    expect(pending.local.entries[0].headword).toBe("学习");
    expect(pending.local.entries[0].senses[0].examples).toBeUndefined();
    release?.();
    const final = await pending.final;
    expect(final.entries[0].headword).toBe("学习");
    expect(final.entries[0].senses[0].examples).toEqual([{ text: "我们学习中文。" }]);
    expect(final.sources).toEqual(["cc-cedict", "wiktionary"]);
    expect(final.entries.map((entry) => entry.headword)).toEqual(
      pending.local.entries.map((entry) => entry.headword)
    );
  });

  test("skips Wiktionary when the local entry already has an example", async () => {
    let called = false;
    const [row] = parseCedict("學習 学习 [xue2 xi2] /to learn/");
    const withExample = new DictionaryIndex("zh", [
      {
        ...row,
        senses: [{ glosses: ["to learn"], examples: [{ text: "already here" }] }],
      },
    ]);
    const pending = await beginDictionaryLookup(
      "学习",
      "zh",
      makeDeps({
        getIndex: async (lang) => {
          if (lang !== "zh") throw new Error(lang);
          return withExample;
        },
        fetchWiktionary: async () => {
          called = true;
          return {
            id: "wiktionary:zh:學習",
            lang: "zh",
            headword: "學習",
            senses: [{ glosses: ["to study"], examples: [{ text: "extra" }] }],
            source: "wiktionary",
          };
        },
      })
    );
    expect(called).toBe(false);
    expect(pending.enrichmentPending).toBe(false);
    expect(pending.local.entries[0].senses[0].examples).toEqual([{ text: "already here" }]);
    expect(await pending.final).toBe(pending.local);
  });

  test("a segmented sentence does not wait for Wiktionary", async () => {
    let called = false;
    const pending = await beginDictionaryLookup(
      "我爱中国",
      "auto",
      makeDeps({
        fetchWiktionary: async () => {
          called = true;
          return null;
        },
      })
    );
    expect(called).toBe(false);
    expect(pending.enrichmentPending).toBe(false);
    expect(pending.local.entries.map((entry) => entry.headword)).toEqual(["我", "爱", "中国"]);
  });
});

describe("English lookup", () => {
  test("merges Free Dictionary entries with Datamuse synonyms", async () => {
    const result = await lookupDictionary(
      "Happy",
      "auto",
      makeDeps({
        fetchFreeDictionary: async (word) => ({
          id: `free-dictionary:${word}`,
          lang: "en",
          headword: word,
          senses: [{ glosses: ["feeling joy"] }],
          synonyms: ["glad"],
          source: "free-dictionary",
        }),
        fetchSynonyms: async () => ["glad", "cheerful"],
      })
    );
    expect(result.entries[0].headword).toBe("happy");
    expect(result.entries[0].synonyms).toEqual(["glad", "cheerful"]);
    expect(headwords(result.similar)).toEqual(["glad", "cheerful"]);
    expect(result.sources).toEqual(["free-dictionary", "datamuse"]);
  });

  test("remote failures degrade to not-found instead of throwing", async () => {
    const errors: string[] = [];
    const result = await lookupDictionary(
      "happy",
      "en",
      makeDeps({
        fetchFreeDictionary: async () => {
          throw new Error("offline");
        },
        fetchSynonyms: async () => {
          throw new Error("offline");
        },
        onRemoteError: (source) => errors.push(source),
      })
    );
    expect(result.notFound).toBe(true);
    expect(errors.sort()).toEqual(["datamuse", "free-dictionary", "wordnet"]);
  });

  test("a missing local dataset still returns a response", async () => {
    const result = await lookupDictionary(
      "学习",
      "zh",
      makeDeps({
        getIndex: async () => {
          throw new Error("download failed");
        },
      })
    );
    expect(result.notFound).toBe(true);
  });
});
