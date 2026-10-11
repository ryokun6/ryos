#!/usr/bin/env bun
/**
 * Parse CEDICT, JMdict, KANJIDIC, kengdic, and WordNet once and write compact
 * index snapshots next to the raw files in DICTIONARY_DATA_DIR.
 * The API loads these at boot and falls back to the raw files when they are
 * missing (local dev).
 */
import path from "node:path";
import { loadIndexFromRaw, loadKanjiFromRaw } from "../api/dictionary/_helpers/_datasets.js";
import { indexSnapshotPath, kanjiSnapshotPath, writeIndexSnapshot, writeKanjiSnapshot } from "../api/dictionary/_helpers/_snapshot.js";
import { wordNetExceptions } from "../api/dictionary/_helpers/_wordnet.js";
import type { DictionaryLanguage } from "../src/shared/dictionary.js";

const dir = process.env.DICTIONARY_DATA_DIR || path.join(process.cwd(), "data", "dictionary");
process.env.DICTIONARY_DATA_DIR = dir;

const langs: DictionaryLanguage[] = ["zh", "ja", "ko", "en"];

for (const lang of langs) {
  const started = performance.now();
  const index = await loadIndexFromRaw(lang);
  const file = indexSnapshotPath(dir, lang);
  await writeIndexSnapshot(file, index, lang === "en" ? wordNetExceptions(index) : undefined);
  const elapsed = Math.round(performance.now() - started);
  console.log(`[dictionary] ${lang} snapshot ${index.size} entries in ${elapsed}ms`);
}

const kanjiStarted = performance.now();
const kanji = await loadKanjiFromRaw();
await writeKanjiSnapshot(kanjiSnapshotPath(dir), kanji);
console.log(
  `[dictionary] kanji snapshot ${kanji.size} entries in ${Math.round(performance.now() - kanjiStarted)}ms`
);
