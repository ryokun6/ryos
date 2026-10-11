#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import { readLookupCache, writeLookupCache } from "../../../api/dictionary/_helpers/_remote";
import type { RedisLike } from "../../../api/_utils/redis";
import type { DictionaryEntry, DictionaryLookupResponse } from "../../../src/shared/dictionary";
import {
  dedupeDictionaryEntries,
  mergeDictionaryLookup,
} from "../../../src/shared/dictionaryMerge";

function entry(overrides: Partial<DictionaryEntry> & Pick<DictionaryEntry, "id" | "headword">): DictionaryEntry {
  return {
    lang: "ko",
    senses: [{ glosses: ["gloss"] }],
    source: "kengdic",
    ...overrides,
  };
}

function response(entries: DictionaryEntry[]): DictionaryLookupResponse {
  return {
    query: entries[0]?.headword ?? "",
    lang: entries[0]?.lang ?? "ko",
    entries,
    phrases: [],
    similar: [],
    suggestions: [],
    sources: ["kengdic", "wiktionary"],
    notFound: entries.length === 0,
  };
}

function memoryRedis() {
  const rows = new Map<string, string>();
  const redis = {
    async get<T>(key: string): Promise<T | null> {
      const row = rows.get(key);
      return row ? (JSON.parse(row) as T) : null;
    },
    async set(key: string, value: unknown) {
      rows.set(key, typeof value === "string" ? value : JSON.stringify(value));
      return "OK";
    },
  };
  return redis as typeof redis & RedisLike;
}

describe("dictionary headword merge", () => {
  test("kengdic and Wiktionary for the same word become one entry", () => {
    const local = entry({
      id: "kengdic:1",
      headword: "사랑",
      senses: [{ glosses: ["love"] }],
      tags: ["level-a"],
    });
    const wiki = entry({
      id: "wiktionary:ko:사랑",
      headword: "사랑",
      senses: [
        { partOfSpeech: "noun", glosses: ["love; affection", "love; beloved"], examples: [{ text: "사랑을 하다" }] },
        { partOfSpeech: "noun", glosses: ["salon, hall"] },
      ],
      source: "wiktionary",
    });
    const [merged] = dedupeDictionaryEntries([local, wiki]);
    expect(dedupeDictionaryEntries([local, wiki])).toHaveLength(1);
    expect(merged).toMatchObject({
      id: "kengdic:1",
      headword: "사랑",
      source: "kengdic",
      tags: ["level-a"],
    });
    expect(merged.senses[0]).toMatchObject({
      partOfSpeech: "noun",
      glosses: ["love; affection", "love; beloved"],
      examples: [{ text: "사랑을 하다" }],
    });
    expect(merged.senses[1]?.glosses).toEqual(["salon, hall"]);
    expect(merged.senses.flatMap((sense) => sense.glosses).filter((gloss) => gloss.toLowerCase() === "love")).toEqual(
      []
    );
  });

  test("matches headwords after NFC and trim, and folds hanja onto the richer entry", () => {
    const jamo = "\u1109\u1161\u1105\u1161\u11BC";
    expect(jamo.normalize("NFC")).toBe("사랑");
    const [merged] = dedupeDictionaryEntries([
      entry({
        id: "kengdic:9",
        headword: ` ${jamo} `,
        hanja: "愛",
        senses: [{ glosses: ["Love"] }],
      }),
      entry({
        id: "wiktionary:ko:사랑",
        headword: "사랑",
        senses: [{ partOfSpeech: "noun", glosses: ["love"], examples: [{ text: "예문", reading: "yemun" }] }],
        source: "wiktionary",
      }),
    ]);
    expect(merged.id).toBe("kengdic:9");
    expect(merged.headword).toBe(` ${jamo} `);
    expect(merged.hanja).toBe("愛");
    expect(merged.senses[0]?.partOfSpeech).toBe("noun");
    expect(merged.senses[0]?.examples).toEqual([{ text: "예문", reading: "yemun" }]);
    expect(merged.senses[0]?.glosses.map((gloss) => gloss.toLowerCase())).toEqual(["love"]);
  });

  test("different hanja stay separate, and an unassigned Wiktionary row is not added", () => {
    const pear = entry({ id: "kengdic:1", headword: "배", hanja: "梨", senses: [{ glosses: ["pear"] }] });
    const ship = entry({ id: "kengdic:2", headword: "배", hanja: "船", senses: [{ glosses: ["ship"] }] });
    const wiki = entry({
      id: "wiktionary:ko:배",
      headword: "배",
      senses: [{ partOfSpeech: "noun", glosses: ["pear", "ship"] }],
      source: "wiktionary",
    });
    expect(dedupeDictionaryEntries([pear, ship, wiki]).map((row) => row.id)).toEqual(["kengdic:1", "kengdic:2"]);
    expect(dedupeDictionaryEntries([pear, ship]).map((row) => row.hanja)).toEqual(["梨", "船"]);
    const shipWiki = entry({
      id: "wiktionary:ko:배:船",
      headword: "배",
      hanja: "船",
      senses: [{ partOfSpeech: "noun", glosses: ["boat"], examples: [{ text: "배가 온다" }] }],
      source: "wiktionary",
    });
    const withHanja = dedupeDictionaryEntries([pear, ship, shipWiki]);
    expect(withHanja.map((row) => row.id)).toEqual(["kengdic:1", "kengdic:2"]);
    expect(withHanja[0]?.senses[0]?.glosses).toEqual(["pear"]);
    expect(withHanja[1]?.senses[0]).toMatchObject({
      partOfSpeech: "noun",
      glosses: ["boat"],
      examples: [{ text: "배가 온다" }],
    });
    expect(withHanja[1]?.senses[1]?.glosses).toEqual(["ship"]);
  });

  test("same hanja merges; conflicting readings stay separate for Chinese and Japanese", () => {
    const school = dedupeDictionaryEntries([
      entry({ id: "kengdic:1", headword: "학교", hanja: "學校", senses: [{ glosses: ["School"] }] }),
      entry({
        id: "wiktionary:ko:학교",
        headword: "학교",
        hanja: "學校",
        senses: [{ partOfSpeech: "noun", glosses: ["school"] }],
        source: "wiktionary",
      }),
    ]);
    expect(school).toHaveLength(1);
    expect(school[0]?.senses[0]?.glosses).toEqual(["school"]);

    const chinese = dedupeDictionaryEntries([
      entry({
        id: "cc-cedict:da4",
        lang: "zh",
        headword: "大",
        reading: "da4",
        senses: [{ glosses: ["big"] }],
        source: "cc-cedict",
      }),
      entry({
        id: "cc-cedict:dai4",
        lang: "zh",
        headword: "大",
        reading: "dai4",
        senses: [{ glosses: ["doctor"] }],
        source: "cc-cedict",
      }),
    ]);
    expect(chinese.map((row) => row.reading)).toEqual(["da4", "dai4"]);

    const japanese = dedupeDictionaryEntries([
      entry({
        id: "jmdict:1",
        lang: "ja",
        headword: "生",
        reading: "なま",
        senses: [{ glosses: ["raw"], examples: [{ text: "生で食べる" }] }],
        source: "jmdict",
      }),
      entry({
        id: "jmdict:2",
        lang: "ja",
        headword: "生",
        reading: "せい",
        senses: [{ glosses: ["life"] }],
        source: "jmdict",
      }),
      entry({
        id: "jmdict:1b",
        lang: "ja",
        headword: "生",
        reading: "なま",
        senses: [{ glosses: ["fresh"] }],
        source: "jmdict",
      }),
    ]);
    expect(japanese.map((row) => row.id)).toEqual(["jmdict:1", "jmdict:2"]);
    expect(japanese[0]?.senses.map((sense) => sense.glosses)).toEqual([["raw"], ["fresh"]]);

    const english = dedupeDictionaryEntries([
      entry({
        id: "wordnet:run",
        lang: "en",
        headword: "run",
        senses: [{ glosses: ["move quickly"] }],
        source: "wordnet",
      }),
      entry({
        id: "wiktionary:en:run",
        lang: "en",
        headword: "Run",
        ipa: "/ɹʌn/",
        senses: [{ partOfSpeech: "verb", glosses: ["to move quickly"], examples: [{ text: "I run daily" }] }],
        source: "wiktionary",
      }),
    ]);
    expect(english).toHaveLength(1);
    expect(english[0]).toMatchObject({ id: "wordnet:run", source: "wordnet", ipa: "/ɹʌn/" });
    expect(english[0]?.senses[0]?.examples?.[0]?.text).toBe("I run daily");
  });

  test("enrichment updates the open entry instead of appending a card", () => {
    const current = response([
      entry({ id: "kengdic:1", headword: "먹다", senses: [{ glosses: ["Eat, chow down on"] }] }),
      entry({ id: "kengdic:2", headword: "먹이다", senses: [{ glosses: ["to feed"] }] }),
    ]);
    const incoming = response([
      entry({
        id: "wiktionary:ko:먹다",
        headword: "먹다",
        senses: [
          {
            partOfSpeech: "verb",
            glosses: ["to eat, drink, have, consume"],
            examples: [{ text: "밥을 먹다", reading: "bab-eul meokda", translation: "to eat food" }],
          },
        ],
        source: "wiktionary",
      }),
      entry({ id: "kengdic:1", headword: "먹다", senses: [{ glosses: ["Eat, chow down on"] }] }),
      entry({ id: "kengdic:2", headword: "먹이다", senses: [{ glosses: ["to feed"] }] }),
    ]);
    const merged = mergeDictionaryLookup(current, incoming);
    expect(merged.entries.map((row) => row.id)).toEqual(["kengdic:1", "kengdic:2"]);
    expect(merged.entries[0]?.senses[0]).toMatchObject({
      partOfSpeech: "verb",
      examples: [{ text: "밥을 먹다", reading: "bab-eul meokda" }],
    });
    expect(merged.entries[0]?.senses.flatMap((sense) => sense.glosses)).toEqual([
      "to eat, drink, have, consume",
      "Eat, chow down on",
    ]);
  });

  test("Redis lookup cache dedupes duplicate headwords on read", async () => {
    const redis = memoryRedis();
    const cached = response([
      entry({
        id: "wiktionary:ko:학교",
        headword: "학교",
        senses: [{ partOfSpeech: "noun", glosses: ["school"] }],
        source: "wiktionary",
      }),
      entry({
        id: "kengdic:2",
        headword: "학교",
        hanja: "學校",
        senses: [{ glosses: ["School"] }],
      }),
    ]);
    await writeLookupCache(redis, "lookup:학교", cached);
    const hit = await readLookupCache(redis, "lookup:학교");
    expect(hit?.entries).toHaveLength(1);
    expect(hit?.entries[0]).toMatchObject({
      id: "wiktionary:ko:학교",
      hanja: "學校",
      source: "kengdic",
      senses: [{ partOfSpeech: "noun", glosses: ["school"] }],
    });
  });
});
