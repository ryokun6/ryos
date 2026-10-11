import { existsSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import type { DictionaryEntry, DictionaryExample, DictionaryLanguage } from "../../../src/shared/dictionary.js";
import { getDictionaryDataDir } from "./_datasets.js";
import { parseWiktionaryResponse } from "./_remote.js";

/**
 * Compact kaikki.org index for the languages and fields
 * `parseWiktionaryResponse` actually reads.
 *
 * Languages: en, zh, ja, ko (the REST `page/definition` buckets).
 * Fields: part of speech, plain gloss, example text / translation / romanization,
 * and Japanese ruby (rendered as furigana).
 *
 * Rows stay in SQLite. Loading every English gloss into a JS Map is large
 * enough to dominate the API heap, so lookup reads one headword at a time.
 */

export const WIKTIONARY_INDEX_SCHEMA = `
CREATE TABLE IF NOT EXISTS sense (
  lang TEXT NOT NULL,
  word TEXT NOT NULL,
  pos TEXT,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alias (
  lang TEXT NOT NULL,
  alias TEXT NOT NULL,
  word TEXT NOT NULL,
  PRIMARY KEY (lang, alias)
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const WIKTIONARY_INDEX_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_sense_lang_word ON sense(lang, word);
`;

interface StoredExample {
  example: string;
  translation?: string;
  transliteration?: string;
  ruby?: [string, string][];
}

interface StoredUsage {
  partOfSpeech?: string;
  language?: string;
  definitions?: {
    definition?: string;
    parsedExamples?: StoredExample[];
  }[];
}

let database: Database | null = null;
let openedPath: string | null = null;

export function localWiktionaryDatabasePath(): string {
  const override = process.env.DICTIONARY_WIKTIONARY_DB?.trim();
  if (override) return override;
  return path.join(getDictionaryDataDir(), "wiktionary.sqlite");
}

export function resetLocalWiktionaryCache(): void {
  database?.close();
  database = null;
  openedPath = null;
}

function openDatabase(): Database | null {
  const file = localWiktionaryDatabasePath();
  if (database && openedPath === file) return database;
  resetLocalWiktionaryCache();
  if (!existsSync(file)) return null;
  try {
    database = new Database(file, { readonly: true });
    openedPath = file;
    return database;
  } catch {
    database = null;
    openedPath = null;
    return null;
  }
}

function rubyToFurigana(text: string, ruby: [string, string][]): DictionaryExample["furigana"] | undefined {
  const segments: { text: string; reading?: string }[] = [];
  let cursor = 0;
  for (const pair of ruby) {
    const base = pair[0];
    const reading = pair[1];
    if (!base || !reading) return undefined;
    const at = text.indexOf(base, cursor);
    if (at < 0) return undefined;
    if (at > cursor) segments.push({ text: text.slice(cursor, at) });
    segments.push({ text: base, reading });
    cursor = at + base.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  if (!segments.some((segment) => segment.reading)) return undefined;
  return segments;
}

function overlayFurigana(entry: DictionaryEntry, usages: StoredUsage[]) {
  if (entry.lang !== "ja") return;
  const rubies = new Map<string, [string, string][]>();
  for (const usage of usages) {
    for (const definition of usage.definitions ?? []) {
      for (const example of definition.parsedExamples ?? []) {
        if (example.ruby?.length) rubies.set(example.example, example.ruby);
      }
    }
  }
  if (rubies.size === 0) return;
  for (const sense of entry.senses) {
    for (const example of sense.examples ?? []) {
      if (example.furigana?.some((segment) => segment.reading)) continue;
      const ruby = rubies.get(example.text);
      if (!ruby) continue;
      const furigana = rubyToFurigana(example.text, ruby);
      if (furigana) example.furigana = furigana;
    }
  }
}

/**
 * Exact headword lookup. Redirect titles and English case variants are
 * aliases. Returns null when the index file is absent or the word is missing.
 */
export function lookupLocalWiktionary(
  headword: string,
  lang: DictionaryLanguage
): DictionaryEntry | null {
  const db = openDatabase();
  if (!db) return null;
  const key = headword.normalize("NFKC");
  const direct = db
    .query("SELECT 1 AS ok FROM sense WHERE lang = ? AND word = ? LIMIT 1")
    .get(lang, key) as { ok: number } | null;
  let word = key;
  if (!direct) {
    const alias = db
      .query("SELECT word FROM alias WHERE lang = ? AND alias = ?")
      .get(lang, key) as { word: string } | null;
    if (!alias) return null;
    word = alias.word;
  }
  const rows = db
    .query("SELECT body FROM sense WHERE lang = ? AND word = ?")
    .all(lang, word) as { body: string }[];
  if (rows.length === 0) return null;
  const usages: StoredUsage[] = [];
  for (const row of rows) {
    try {
      usages.push(JSON.parse(row.body) as StoredUsage);
    } catch {
      // skip a corrupt row
    }
  }
  const capped = lang === "en" ? usages.slice(0, 6) : usages;
  if (capped.length === 0) return null;
  const entry = parseWiktionaryResponse({ [lang]: capped }, lang, headword);
  if (!entry) return null;
  overlayFurigana(entry, capped);
  return entry;
}
