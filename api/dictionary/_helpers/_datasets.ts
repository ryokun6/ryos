import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { toHiragana } from "wanakana";
import type {
  DictionaryEntry,
  DictionaryKanjiInfo,
  DictionaryLanguage,
} from "../../../src/shared/dictionary.js";
import { normalizePinyinSearchKey } from "../../../src/utils/zhuyin.js";
import {
  datasetCacheFiles,
  fetchDatasetBytes,
  type DatasetId,
} from "./_dataset-sources.js";
import { DictionaryIndex } from "./_index.js";
import {
  indexSnapshotPath,
  kanjiSnapshotPath,
  readIndexSnapshot,
  readKanjiSnapshot,
} from "./_snapshot.js";
import { buildEnglishDictionary, setWordNetExceptions } from "./_wordnet.js";
import {
  extractFirstTarFile,
  formatCedictLine,
  iterateCedict,
  parseCedictLine,
  parseJmdict,
  parseKanjidic,
  parseKengdic,
  type JmdictFile,
  type KanjidicFile,
} from "./_parsers.js";

export { DATASETS, type DatasetId } from "./_dataset-sources.js";

export function getDictionaryDataDir(): string {
  return process.env.DICTIONARY_DATA_DIR || path.join(tmpdir(), "ryos-dictionary");
}

/** Read a dataset from the disk cache, downloading it on first use. */
export async function loadDatasetBytes(
  id: DatasetId,
  options?: Parameters<typeof fetchDatasetBytes>[1]
): Promise<Uint8Array> {
  const dir = getDictionaryDataDir();
  for (const file of datasetCacheFiles(id)) {
    try {
      const cached = new Uint8Array(await readFile(path.join(dir, file)));
      if (cached.byteLength > 0) return cached;
    } catch {
      // try the next cached name
    }
  }
  const { bytes, file } = await fetchDatasetBytes(id, options);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, file);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, bytes);
  await rename(temp, target);
  return bytes;
}

function decodeTgzJson<T>(bytes: Uint8Array): T {
  const tar = gunzipSync(bytes);
  const file = extractFirstTarFile(new Uint8Array(tar.buffer, tar.byteOffset, tar.byteLength));
  if (!file) throw new Error("Empty dictionary archive");
  return JSON.parse(new TextDecoder().decode(file)) as T;
}

// ============================================================================
// Index builders (exported for tests)
// ============================================================================

export function buildChineseIndex(entries: Iterable<DictionaryEntry>): DictionaryIndex {
  return new DictionaryIndex("zh", entries, {
    rowEncoding: "cedict",
    serialize: formatCedictLine,
    materialize: (row) => parseCedictLine(row)!,
    headwordKeys: (entry) => [entry.traditional ?? "", entry.simplified ?? ""].filter(Boolean),
    readingKeys: (entry) => (entry.reading ? [normalizePinyinSearchKey(entry.reading)] : []),
    // Proper nouns (capitalized pinyin) and "variant of" rows sort after common words.
    rank: (entry) => {
      let rank = 0;
      if (entry.reading && /^[A-Z]/.test(entry.reading)) rank += 2;
      const gloss = entry.senses[0]?.glosses[0] ?? "";
      if (/^(variant of|old variant of|surname |see )/i.test(gloss)) rank += 1;
      return rank;
    },
  });
}

/** Hiragana search key; romaji input ("taberu") is converted too. */
export function hiraganaKey(text: string): string {
  return toHiragana(text.trim().toLowerCase()).replace(/\s+/g, "");
}

export function buildJapaneseIndex(entries: DictionaryEntry[]): DictionaryIndex {
  return new DictionaryIndex("ja", entries, {
    headwordKeys: (entry) => [
      ...(entry.alternates ?? []),
      ...(entry.reading ? [entry.reading] : []),
      ...(entry.readings ?? []),
    ],
    readingKeys: (entry) =>
      [entry.reading ?? entry.headword, ...(entry.readings ?? [])].map(hiraganaKey),
    rank: (entry) => (entry.tags?.includes("common") ? 0 : 1),
  });
}

export function buildKoreanIndex(entries: DictionaryEntry[]): DictionaryIndex {
  return new DictionaryIndex("ko", entries, {
    headwordKeys: (entry) => (entry.hanja ? [entry.hanja] : []),
    rank: (entry) => {
      const level = entry.tags?.find((tag) => tag.startsWith("level-"));
      const levelRank = level ? " abc".indexOf(level.slice(6)) : 4;
      return (levelRank > 0 ? levelRank : 4) + (entry.headword.includes(" ") ? 5 : 0);
    },
  });
}

// ============================================================================
// Lazy singletons — one in-flight load per dataset per process
// ============================================================================

const indexPromises = new Map<DictionaryLanguage, Promise<DictionaryIndex>>();
let kanjiPromise: Promise<Map<string, DictionaryKanjiInfo>> | null = null;

function materializeRow(encoding: "json" | "cedict"): (row: string) => DictionaryEntry {
  if (encoding === "cedict") return (row) => parseCedictLine(row)!;
  return (row) => JSON.parse(row) as DictionaryEntry;
}

async function loadIndexSnapshot(lang: DictionaryLanguage): Promise<DictionaryIndex | null> {
  const bundle = await readIndexSnapshot(indexSnapshotPath(getDictionaryDataDir(), lang));
  if (!bundle || bundle.parts.lang !== lang || bundle.parts.rows.length === 0) return null;
  const index = DictionaryIndex.restore({
    ...bundle.parts,
    materialize: materializeRow(bundle.parts.rowEncoding),
  });
  if (lang === "en" && bundle.exceptions.size) setWordNetExceptions(index, bundle.exceptions);
  return index;
}

/** Parse the raw dataset. Used at image build time and when no snapshot is present. */
export async function loadIndexFromRaw(lang: DictionaryLanguage): Promise<DictionaryIndex> {
  switch (lang) {
    case "zh": {
      const text = new TextDecoder().decode(gunzipSync(await loadDatasetBytes("cedict")));
      return buildChineseIndex(iterateCedict(text));
    }
    case "ja": {
      const file = decodeTgzJson<JmdictFile>(await loadDatasetBytes("jmdict"));
      return buildJapaneseIndex(parseJmdict(file));
    }
    case "ko": {
      const text = new TextDecoder().decode(await loadDatasetBytes("kengdic"));
      return buildKoreanIndex(parseKengdic(text));
    }
    case "en":
      return buildEnglishDictionary(await loadDatasetBytes("wordnet"));
    default:
      throw new Error(`No local dictionary for ${lang}`);
  }
}

async function loadIndex(lang: DictionaryLanguage): Promise<DictionaryIndex> {
  try {
    const snapshot = await loadIndexSnapshot(lang);
    if (snapshot) return snapshot;
  } catch (error) {
    console.warn(
      `[dictionary] ${lang} snapshot unreadable, parsing raw data`,
      error instanceof Error ? error.message : error
    );
  }
  return loadIndexFromRaw(lang);
}

export async function loadKanjiFromRaw(): Promise<Map<string, DictionaryKanjiInfo>> {
  return parseKanjidic(decodeTgzJson<KanjidicFile>(await loadDatasetBytes("kanjidic")));
}

/**
 * Load every local dictionary into memory. Safe to call at process start:
 * a failed dataset is logged by the caller and stays lazy for the next lookup.
 */
export async function warmDictionaryIndexes(): Promise<{ ok: string[]; failed: string[] }> {
  const jobs: [string, Promise<unknown>][] = [
    ["en", getDictionaryIndex("en")],
    ["zh", getDictionaryIndex("zh")],
    ["ja", getDictionaryIndex("ja")],
    ["ko", getDictionaryIndex("ko")],
    ["kanjidic", getKanjiInfoMap()],
  ];
  const ok: string[] = [];
  const failed: string[] = [];
  await Promise.all(
    jobs.map(async ([name, task]) => {
      try {
        await task;
        ok.push(name);
      } catch {
        failed.push(name);
      }
    })
  );
  return { ok, failed };
}

export function getDictionaryIndex(lang: DictionaryLanguage): Promise<DictionaryIndex> {
  let promise = indexPromises.get(lang);
  if (!promise) {
    promise = loadIndex(lang).catch((error) => {
      indexPromises.delete(lang);
      throw error;
    });
    indexPromises.set(lang, promise);
  }
  return promise;
}

export function getKanjiInfoMap(): Promise<Map<string, DictionaryKanjiInfo>> {
  if (!kanjiPromise) {
    kanjiPromise = readKanjiSnapshot(kanjiSnapshotPath(getDictionaryDataDir()))
      .then((snapshot) => snapshot ?? loadKanjiFromRaw())
      .catch((error) => {
        kanjiPromise = null;
        throw error;
      });
  }
  return kanjiPromise;
}

/** Test hook: inject prebuilt indexes instead of downloading datasets. */
export function setDictionaryIndexForTests(
  lang: DictionaryLanguage,
  index: DictionaryIndex | null
): void {
  if (index) indexPromises.set(lang, Promise.resolve(index));
  else indexPromises.delete(lang);
}

export function setKanjiInfoForTests(map: Map<string, DictionaryKanjiInfo> | null): void {
  kanjiPromise = map ? Promise.resolve(map) : null;
}
