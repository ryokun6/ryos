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
import { DictionaryIndex } from "./_index.js";
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

const JMDICT_SIMPLIFIED_VERSION =
  process.env.DICTIONARY_JMDICT_VERSION || "3.6.2+20261005200550";
const JMDICT_BASE = `https://github.com/scriptin/jmdict-simplified/releases/download/${encodeURIComponent(JMDICT_SIMPLIFIED_VERSION)}`;
const JMDICT_VARIANT =
  process.env.DICTIONARY_JMDICT_VARIANT === "full" ? "jmdict-eng" : "jmdict-eng-common";

export const DATASETS = {
  cedict: {
    url: "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz",
    file: "cedict.txt.gz",
  },
  jmdict: {
    url: `${JMDICT_BASE}/${JMDICT_VARIANT}-${JMDICT_SIMPLIFIED_VERSION}.json.tgz`,
    file: `${JMDICT_VARIANT}-${JMDICT_SIMPLIFIED_VERSION}.json.tgz`,
  },
  kanjidic: {
    url: `${JMDICT_BASE}/kanjidic2-en-${JMDICT_SIMPLIFIED_VERSION}.json.tgz`,
    file: `kanjidic2-en-${JMDICT_SIMPLIFIED_VERSION}.json.tgz`,
  },
  kengdic: {
    url: "https://raw.githubusercontent.com/garfieldnate/kengdic/master/kengdic.tsv",
    file: "kengdic.tsv",
  },
} as const;

export type DatasetId = keyof typeof DATASETS;

export function getDictionaryDataDir(): string {
  return process.env.DICTIONARY_DATA_DIR || path.join(tmpdir(), "ryos-dictionary");
}

const DOWNLOAD_TIMEOUT_MS = 60_000;

/** Read a dataset from the disk cache, downloading it on first use. */
export async function loadDatasetBytes(id: DatasetId): Promise<Uint8Array> {
  const { url, file } = DATASETS[id];
  const dir = getDictionaryDataDir();
  const target = path.join(dir, file);
  try {
    return new Uint8Array(await readFile(target));
  } catch {
    // not cached yet
  }
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { "User-Agent": "ryOS-dictionary/1.0 (+https://os.ryo.lu)" },
  });
  if (!response.ok) {
    throw new Error(`Dictionary dataset ${id} download failed: ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(dir, { recursive: true });
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

async function loadIndex(lang: DictionaryLanguage): Promise<DictionaryIndex> {
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
    default:
      throw new Error(`No local dictionary for ${lang}`);
  }
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
    kanjiPromise = loadDatasetBytes("kanjidic")
      .then((bytes) => parseKanjidic(decodeTgzJson<KanjidicFile>(bytes)))
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
