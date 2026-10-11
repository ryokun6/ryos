#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  englishLemmaCandidates,
  lemmaFromFormOfGloss,
} from "../../../api/dictionary/_helpers/_english";
import { lookupDictionary, type DictionaryLookupDeps } from "../../../api/dictionary/_helpers/_lookup";
import type { DictionaryEntry } from "../../../src/shared/dictionary";

function entry(
  word: string,
  gloss: string,
  source: DictionaryEntry["source"] = "free-dictionary"
): DictionaryEntry {
  return {
    id: `${source}:${word}`,
    lang: "en",
    headword: word,
    senses: [{ glosses: [gloss] }],
    source,
  };
}

function deps(overrides: Partial<DictionaryLookupDeps> = {}): DictionaryLookupDeps {
  return {
    getIndex: async () => {
      throw new Error("no local english");
    },
    fetchFreeDictionary: async () => null,
    fetchSynonyms: async () => [],
    fetchWiktionary: async () => null,
    ...overrides,
  };
}

describe("English lemmas", () => {
  test("leaves base words alone and recovers plurals and verb forms", () => {
    expect(englishLemmaCandidates("hello")).toEqual([]);
    expect(englishLemmaCandidates("run")).toEqual([]);
    expect(englishLemmaCandidates("beautiful")).toEqual([]);
    expect(englishLemmaCandidates("take")).toEqual([]);
    expect(englishLemmaCandidates("water")).toEqual([]);
    expect(englishLemmaCandidates("this")).toEqual([]);
    expect(englishLemmaCandidates("cats")).toEqual(["cat"]);
    expect(englishLemmaCandidates("waters")).toEqual(["water"]);
    expect(englishLemmaCandidates("boxes")).toEqual(["box"]);
    expect(englishLemmaCandidates("studies")).toEqual(["study"]);
    expect(englishLemmaCandidates("running")).toEqual(["run"]);
    expect(englishLemmaCandidates("taking")).toEqual(["take", "tak"]);
    expect(englishLemmaCandidates("stopped")).toEqual(["stop"]);
    expect(englishLemmaCandidates("took")).toEqual(["take"]);
    expect(englishLemmaCandidates("children")).toEqual(["child"]);
    expect(englishLemmaCandidates("mice")).toEqual(["mouse"]);
    expect(englishLemmaCandidates("cat's")).toEqual(["cat"]);
  });

  test("reads Wiktionary form-of glosses and ignores real definitions", () => {
    expect(lemmaFromFormOfGloss("plural of run")).toBe("run");
    expect(lemmaFromFormOfGloss("simple past of take")).toBe("take");
    expect(lemmaFromFormOfGloss("third-person singular simple present of run")).toBe("run");
    expect(lemmaFromFormOfGloss("present participle of run")).toBe("run");
    expect(lemmaFromFormOfGloss("present participle and gerund of run")).toBe("run");
    expect(lemmaFromFormOfGloss("third-person singular simple present indicative of cat")).toBe(
      "cat"
    );
    expect(lemmaFromFormOfGloss("past tense of take")).toBe("take");
    expect(
      lemmaFromFormOfGloss("An inorganic compound (of molecular formula H2O) found in rivers.")
    ).toBeNull();
    expect(lemmaFromFormOfGloss("To move swiftly.")).toBeNull();
  });
});

describe("English lookup fallbacks", () => {
  test("lowercases the query before calling a source", async () => {
    let requested = "";
    const result = await lookupDictionary(
      "  HELLO ",
      "auto",
      deps({
        fetchFreeDictionary: async (word) => {
          requested = word;
          return entry(word, "used as a greeting");
        },
      })
    );
    expect(requested).toBe("hello");
    expect(result.notFound).toBe(false);
    expect(result.entries[0].headword).toBe("hello");
  });

  test("prefers Free Dictionary when it already has the word", async () => {
    const calls: string[] = [];
    const result = await lookupDictionary(
      "hello",
      "en",
      deps({
        fetchFreeDictionary: async (word) => {
          calls.push(`free:${word}`);
          return entry(word, "used as a greeting");
        },
        fetchWiktionary: async (headword) => {
          calls.push(`wiki:${headword}`);
          return entry(headword, "a greeting said when meeting someone", "wiktionary");
        },
        fetchSynonyms: async () => ["hi"],
      })
    );
    expect(calls).toEqual(["free:hello"]);
    expect(result.entries[0].senses[0].glosses).toEqual(["used as a greeting"]);
    expect(result.entries[0].synonyms).toEqual(["hi"]);
    expect(result.sources).toEqual(["free-dictionary", "datamuse"]);
  });

  test("Free Dictionary 404s for run and water fall back to Wiktionary", async () => {
    // Live api.dictionaryapi.dev returns an HTML 404 for these common words.
    const missing = new Set(["run", "water"]);
    for (const word of ["hello", "run", "beautiful", "take", "water"]) {
      const result = await lookupDictionary(
        word,
        "en",
        deps({
          fetchFreeDictionary: async (queried) =>
            missing.has(queried) ? null : entry(queried, `free definition of ${queried}`),
          fetchWiktionary: async (headword, lang) => {
            expect(lang).toBe("en");
            return entry(headword, `wiki definition of ${headword}`, "wiktionary");
          },
        })
      );
      expect(result.notFound).toBe(false);
      expect(result.entries[0].headword).toBe(word);
      expect(result.entries[0].senses[0].glosses[0]).toContain(word);
      expect(result.sources).toContain(missing.has(word) ? "wiktionary" : "free-dictionary");
    }
  });

  test("a Free Dictionary error still returns Wiktionary definitions", async () => {
    const result = await lookupDictionary(
      "Beautiful",
      "auto",
      deps({
        fetchFreeDictionary: async () => {
          throw new Error("Remote dictionary 502");
        },
        fetchWiktionary: async (headword) =>
          entry(headword, "possessing beauty", "wiktionary"),
        fetchSynonyms: async () => ["lovely"],
      })
    );
    expect(result.notFound).toBe(false);
    expect(result.entries[0]).toMatchObject({ headword: "beautiful", source: "wiktionary" });
    expect(result.sources).toEqual(["wiktionary", "datamuse"]);
    expect(result.similar.map((item) => item.headword)).toEqual(["lovely"]);
  });

  test("does not wait out a hung Free Dictionary request", async () => {
    let release: (value: null) => void = () => {};
    const hung = new Promise<null>((resolve) => {
      release = resolve;
    });
    const started = Date.now();
    const result = await lookupDictionary(
      "water",
      "en",
      deps({
        fetchFreeDictionary: () => hung,
        fetchWiktionary: async () => entry("water", "a clear liquid", "wiktionary"),
      })
    );
    const elapsed = Date.now() - started;
    release(null);
    expect(result.notFound).toBe(false);
    expect(result.entries[0].senses[0].glosses).toEqual(["a clear liquid"]);
    expect(result.sources).toEqual(["wiktionary"]);
    expect(elapsed).toBeLessThan(2500);
  });

  test("lemmatizes plurals and verb forms when the surface form is missing", async () => {
    const seen: string[] = [];
    const glosses: Record<string, string> = {
      run: "to move swiftly",
      cat: "a small domesticated feline",
      water: "a clear liquid",
      take: "to get into one's possession",
    };
    const lookup = (word: string) =>
      lookupDictionary(
        word,
        "en",
        deps({
          fetchFreeDictionary: async (queried) => {
            seen.push(queried);
            return glosses[queried] ? entry(queried, glosses[queried]) : null;
          },
        })
      );

    expect((await lookup("running")).entries[0].headword).toBe("run");
    expect((await lookup("cats")).entries[0].headword).toBe("cat");
    expect((await lookup("waters")).entries[0].headword).toBe("water");
    expect((await lookup("took")).entries[0].headword).toBe("take");
    expect(seen).toContain("running");
    expect(seen).toContain("run");
    expect(seen).not.toContain("rune");
  });

  test("keeps a real definition and drops a buried form-of line", async () => {
    const result = await lookupDictionary(
      "run",
      "en",
      deps({
        fetchFreeDictionary: async () => ({
          id: "free-dictionary:run",
          lang: "en",
          headword: "run",
          senses: [
            {
              partOfSpeech: "verb",
              glosses: ["to move swiftly", "past participle of rin"],
            },
          ],
          source: "free-dictionary",
        }),
      })
    );
    expect(result.entries[0].headword).toBe("run");
    expect(result.entries[0].senses[0].glosses).toEqual(["to move swiftly"]);
  });

  test("opens an inflected word on its lemma and keeps extra senses", async () => {
    const result = await lookupDictionary(
      "waters",
      "en",
      deps({
        fetchFreeDictionary: async (word) =>
          word === "water" ? entry("water", "a clear liquid") : null,
        fetchWiktionary: async (headword) =>
          headword === "waters"
            ? {
                id: "wiktionary:en:waters",
                lang: "en",
                headword: "waters",
                senses: [
                  { partOfSpeech: "noun", glosses: ["plural of water"] },
                  { partOfSpeech: "noun", glosses: ["amniotic fluid"] },
                ],
                source: "wiktionary",
              }
            : null,
      })
    );
    expect(result.entries[0].headword).toBe("water");
    expect(result.entries[0].senses[0].glosses).toEqual(["a clear liquid"]);
    expect(result.entries[0].senses.some((sense) => sense.glosses.includes("amniotic fluid"))).toBe(
      true
    );
    expect(result.sources).toEqual(["free-dictionary"]);
  });

  test("follows a Wiktionary form-of gloss to the lemma", async () => {
    const result = await lookupDictionary(
      "took",
      "en",
      deps({
        fetchFreeDictionary: async (word) =>
          word === "take" ? entry("take", "to get into one's possession") : null,
        fetchWiktionary: async (headword) =>
          headword === "took"
            ? {
                id: "wiktionary:en:took",
                lang: "en",
                headword: "took",
                senses: [{ partOfSpeech: "verb", glosses: ["simple past of take"] }],
                source: "wiktionary",
              }
            : null,
      })
    );
    expect(result.notFound).toBe(false);
    expect(result.entries[0].headword).toBe("take");
    expect(result.entries[0].senses[0].glosses).toEqual(["to get into one's possession"]);
    expect(result.sources).toEqual(["free-dictionary"]);
  });
});
