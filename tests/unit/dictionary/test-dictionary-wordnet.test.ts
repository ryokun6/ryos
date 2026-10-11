#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import { ENRICHMENT_DEADLINE_MS, lookupDictionary } from "../../../api/dictionary/_helpers/_lookup";
import {
  buildEnglishIndex,
  lookupWordNet,
  parseWordNetExceptions,
  splitWordNetGloss,
  wordNetLemmaCandidates,
  type WordNetTexts,
} from "../../../api/dictionary/_helpers/_wordnet";
import type { DictionaryEntry } from "../../../src/shared/dictionary";

function texts(partial: Partial<WordNetTexts> = {}): WordNetTexts {
  return {
    "data.noun": "",
    "data.verb": "",
    "data.adj": "",
    "data.adv": "",
    "index.noun": "",
    "index.verb": "",
    "index.adj": "",
    "index.adv": "",
    "noun.exc": "",
    "verb.exc": "",
    "adj.exc": "",
    "adv.exc": "",
    ...partial,
  };
}

const DATA_VERB = `
  1 This software and database is being provided to you, the LICENSEE, by
00000001 03 v 02 run 0 sprint 0 000 | to move swiftly; "he runs every morning"
00000002 03 v 01 take 0 000 | to get hold of something
00000003 03 v 01 sprint 0 000 | to run at top speed
`;

const DATA_NOUN = `
00000011 03 n 01 mouse 0 000 | a small rodent
`;

const INDEX_VERB = `
run v 1 0 1 1 00000001
take v 1 0 1 1 00000002
sprint v 1 0 1 1 00000003
`;

const INDEX_NOUN = `
mouse n 1 0 1 0 00000011
`;

function sampleIndex() {
  return buildEnglishIndex(
    texts({
      "data.verb": DATA_VERB,
      "data.noun": DATA_NOUN,
      "index.verb": INDEX_VERB,
      "index.noun": INDEX_NOUN,
      "verb.exc": "took take\nzoomed sprint\n",
      "noun.exc": "mice mouse\n",
      "adj.exc": "better good well\n",
    })
  );
}

describe("WordNet parsing", () => {
  test("keeps the lead gloss, a quoted example, and synset synonyms", () => {
    expect(splitWordNetGloss('to move swiftly; "he runs"')).toEqual({
      gloss: "to move swiftly",
      examples: ["he runs"],
    });
    const index = sampleIndex();
    const run = index.lookupHeadword("run")[0];
    expect(run.source).toBe("wordnet");
    expect(run.senses[0]?.glosses[0]).toBe("to move swiftly");
    expect(run.senses[0]?.examples?.[0]?.text).toBe("he runs every morning");
    expect(run.senses[0]?.partOfSpeech).toBe("verb");
    expect(run.synonyms).toContain("sprint");
  });

  test("leads with the part of speech that has more senses", () => {
    const nounOffsets = Array.from({ length: 9 }, (_, i) => String(i + 1).padStart(8, "0"));
    const verbOffsets = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(8, "0"));
    const nounLines = nounOffsets.map(
      (offset, i) => `${offset} 03 n 01 run 0 000 | noun sense number ${i + 1} here`
    );
    const verbLines = verbOffsets.map(
      (offset, i) => `${offset} 03 v 01 run 0 000 | verb sense number ${i + 1} here`
    );
    const index = buildEnglishIndex(
      texts({
        "data.noun": nounLines.join("\n"),
        "data.verb": verbLines.join("\n"),
        "index.noun": `run n ${nounOffsets.length} 0 ${nounOffsets.length} 0 ${nounOffsets.join(" ")}`,
        "index.verb": `run v ${verbOffsets.length} 0 ${verbOffsets.length} 0 ${verbOffsets.join(" ")}`,
      })
    );
    const run = index.lookupHeadword("run")[0];
    expect(run.senses[0]?.partOfSpeech).toBe("verb");
    expect(run.senses[0]?.glosses[0]).toBe("verb sense number 1 here");
    expect(run.senses.some((sense) => sense.partOfSpeech === "noun")).toBe(true);
  });

  test("reads WordNet exception lists", () => {
    const exceptions = parseWordNetExceptions("took take\nmice mouse\nbetter good well\n");
    expect(exceptions.get("took")).toEqual(["take"]);
    expect(exceptions.get("mice")).toEqual(["mouse"]);
    expect(exceptions.get("better")).toEqual(["good", "well"]);
  });
});

describe("WordNet lemmas", () => {
  test("exception list wins over the suffix fallback, then suffix still applies", () => {
    const index = sampleIndex();
    expect(wordNetLemmaCandidates(index, "zoomed")[0]).toBe("sprint");
    expect(index.lookupHeadword("zoomed")).toEqual([]);
    const zoomed = lookupWord(index, "zoomed");
    expect(zoomed?.headword).toBe("sprint");
    expect(lookupWord(index, "took")?.headword).toBe("take");
    expect(lookupWord(index, "mice")?.headword).toBe("mouse");
    expect(lookupWord(index, "running")?.headword).toBe("run");
  });
});

function lookupWord(index: ReturnType<typeof sampleIndex>, word: string): DictionaryEntry | null {
  return lookupWordNet(index, word);
}

describe("English lookup order", () => {
  const index = sampleIndex();

  test("a WordNet hit returns even when remote sources hang", async () => {
    const started = Date.now();
    const result = await lookupDictionary("run", "en", {
      getIndex: async () => index,
      fetchFreeDictionary: () => new Promise(() => {}),
      fetchWiktionary: () => new Promise(() => {}),
      fetchSynonyms: () => new Promise(() => {}),
    });
    expect(Date.now() - started).toBeLessThan(ENRICHMENT_DEADLINE_MS + 800);
    expect(result.notFound).toBe(false);
    expect(result.entries[0]?.source).toBe("wordnet");
    expect(result.entries[0]?.senses[0]?.glosses[0]).toBe("to move swiftly");
    expect(result.sources).toEqual(["wordnet"]);
    expect(result.similar.map((item) => item.headword)).toContain("sprint");
  });

  test("a remote failure cannot turn a WordNet hit into not-found", async () => {
    const result = await lookupDictionary("  RUN ", "en", {
      getIndex: async () => index,
      fetchFreeDictionary: async () => {
        throw new Error("timeout");
      },
      fetchWiktionary: async () => {
        throw new Error("Remote dictionary 503");
      },
      fetchSynonyms: async () => {
        throw new Error("fetch failed");
      },
    });
    expect(result.notFound).toBe(false);
    expect(result.entries[0]?.headword).toBe("run");
    expect(result.entries[0]?.senses[0]?.glosses[0]).toBe("to move swiftly");
  });

  test("audio and examples enrich a hit without replacing the WordNet gloss", async () => {
    const result = await lookupDictionary("run", "en", {
      getIndex: async () => index,
      fetchFreeDictionary: async () => ({
        id: "free-dictionary:run",
        lang: "en",
        headword: "run",
        ipa: "/rʌn/",
        audioUrl: "https://example.test/run.mp3",
        senses: [
          {
            glosses: ["SHOULD NOT REPLACE"],
            examples: [{ text: "She runs daily." }],
          },
        ],
        source: "free-dictionary",
      }),
      fetchWiktionary: async () => null,
      fetchSynonyms: async () => ["dash"],
    });
    expect(result.entries[0]?.senses[0]?.glosses[0]).toBe("to move swiftly");
    expect(result.entries[0]?.ipa).toBe("/rʌn/");
    expect(result.entries[0]?.audioUrl).toBe("https://example.test/run.mp3");
    expect(result.entries[0]?.senses[0]?.examples?.map((example) => example.text)).toContain(
      "She runs daily."
    );
    expect(result.sources).toEqual(["wordnet", "free-dictionary", "datamuse"]);
    expect(result.entries[0]?.synonyms).toEqual(["sprint", "dash"]);
  });

  test("words missing from WordNet still use Free Dictionary and Wiktionary", async () => {
    const result = await lookupDictionary("serendipity", "en", {
      getIndex: async () => index,
      fetchFreeDictionary: async () => null,
      fetchSynonyms: async () => [],
      fetchWiktionary: async () => ({
        id: "wiktionary:serendipity",
        lang: "en",
        headword: "serendipity",
        senses: [{ glosses: ["A happy accident."] }],
        source: "wiktionary",
      }),
    });
    expect(result.notFound).toBe(false);
    expect(result.entries[0]?.source).toBe("wiktionary");
    expect(result.entries[0]?.senses[0]?.glosses[0]).toBe("A happy accident.");
    expect(result.sources).toContain("wiktionary");
  });
});
