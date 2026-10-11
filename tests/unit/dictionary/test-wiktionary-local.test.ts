import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { fetchWiktionary, wiktionarySourceMode } from "../../../api/dictionary/_helpers/_remote";
import {
  lookupLocalWiktionary,
  resetLocalWiktionaryCache,
  WIKTIONARY_INDEX_SCHEMA,
} from "../../../api/dictionary/_helpers/_wiktionary-local";

const dir = mkdtempSync(join(tmpdir(), "ryos-wiki-"));
const dbPath = join(dir, "wiktionary.sqlite");

function seed() {
  const db = new Database(dbPath);
  db.exec(WIKTIONARY_INDEX_SCHEMA);
  db.exec("CREATE INDEX IF NOT EXISTS idx_sense_lang_word ON sense(lang, word)");
  const insert = db.prepare("INSERT INTO sense (lang, word, pos, body) VALUES (?, ?, ?, ?)");
  insert.run(
    "en",
    "water",
    "Noun",
    JSON.stringify({
      partOfSpeech: "Noun",
      language: "English",
      definitions: [
        {
          definition: "An inorganic compound (of molecular formula H2O).",
          parsedExamples: [{ example: "Run!" }],
        },
        { definition: "plural of run" },
      ],
    })
  );
  insert.run(
    "en",
    "English",
    "Noun",
    JSON.stringify({
      partOfSpeech: "Noun",
      language: "English",
      definitions: [{ definition: "A West Germanic language." }],
    })
  );
  db.prepare("INSERT INTO alias (lang, alias, word) VALUES (?, ?, ?)").run("en", "english", "English");
  insert.run(
    "ja",
    "痛い",
    "Adjective",
    JSON.stringify({
      partOfSpeech: "Adjective",
      definitions: [
        {
          definition: "painful",
          parsedExamples: [
            {
              example: "頭が痛い。",
              translation: "I have a headache.",
              transliteration: "Atama ga itai.",
              ruby: [
                ["頭", "あたま"],
                ["痛", "いた"],
              ],
            },
          ],
        },
      ],
    })
  );
  insert.run(
    "zh",
    "国",
    "Character",
    JSON.stringify({
      partOfSpeech: "Character",
      definitions: [{ definition: "country" }],
    })
  );
  db.prepare("INSERT INTO alias (lang, alias, word) VALUES (?, ?, ?)").run("zh", "國", "国");
  db.close();
}

seed();

afterEach(() => {
  resetLocalWiktionaryCache();
  delete process.env.DICTIONARY_WIKTIONARY_SOURCE;
  delete process.env.DICTIONARY_WIKTIONARY_DB;
});

describe("local Wiktionary index", () => {
  test("reads glosses, examples, case aliases, and script redirects", () => {
    process.env.DICTIONARY_WIKTIONARY_DB = dbPath;
    const water = lookupLocalWiktionary("water", "en");
    expect(water?.source).toBe("wiktionary");
    expect(water?.headword).toBe("water");
    expect(water?.senses[0].glosses).toEqual([
      "An inorganic compound (of molecular formula H2O).",
      "plural of run",
    ]);
    expect(water?.senses[0].examples?.[0].text).toBe("Run!");

    const viaCase = lookupLocalWiktionary("english", "en");
    expect(viaCase?.senses[0].glosses[0]).toBe("A West Germanic language.");

    const viaTraditional = lookupLocalWiktionary("國", "zh");
    expect(viaTraditional?.senses[0].glosses).toEqual(["country"]);
    expect(lookupLocalWiktionary("missing", "en")).toBeNull();
  });

  test("turns Japanese ruby into furigana", () => {
    process.env.DICTIONARY_WIKTIONARY_DB = dbPath;
    const entry = lookupLocalWiktionary("痛い", "ja");
    expect(entry?.senses[0].examples?.[0]).toMatchObject({
      text: "頭が痛い。",
      translation: "I have a headache.",
      reading: "Atama ga itai.",
      furigana: [
        { text: "頭", reading: "あたま" },
        { text: "が" },
        { text: "痛", reading: "いた" },
        { text: "い。" },
      ],
    });
  });

  test("local mode does not fall through when the index misses", async () => {
    process.env.DICTIONARY_WIKTIONARY_DB = dbPath;
    process.env.DICTIONARY_WIKTIONARY_SOURCE = "local";
    expect(wiktionarySourceMode()).toBe("local");
    const hit = await fetchWiktionary("water", "en", null);
    expect(hit?.senses[0].glosses[0]).toContain("H2O");
    expect(await fetchWiktionary("not-in-the-index-xyz", "en", null)).toBeNull();
  });
});
