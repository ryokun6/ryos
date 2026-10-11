/**
 * Download locations for the offline dictionaries.
 *
 * WordNet 3.1 database © 2011 Princeton University. All rights reserved.
 * Used under the WordNet License. The notice ships in the header of the
 * published database files. The NLTK mirror is the same database, packed as a
 * zip with files under `wordnet31/` instead of `dict/`.
 */

const JMDICT_SIMPLIFIED_VERSION =
  process.env.DICTIONARY_JMDICT_VERSION || "3.6.2+20261005200550";
const JMDICT_BASE = `https://github.com/scriptin/jmdict-simplified/releases/download/${encodeURIComponent(JMDICT_SIMPLIFIED_VERSION)}`;
const JMDICT_VARIANT =
  process.env.DICTIONARY_JMDICT_VARIANT === "full" ? "jmdict-eng" : "jmdict-eng-common";

/** NLTK's WordNet 3.1 pack. Files match Princeton's wn3.1 byte for byte. */
export const WORDNET_NLTK_URL =
  "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/wordnet31.zip";

/** Princeton's official tarball. Slow and flaky from some hosts. */
export const WORDNET_PRINCETON_URL = "https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz";

export const DATASET_DOWNLOAD_ATTEMPTS = 3;

/** Wait before attempt 2 and attempt 3. */
export const DATASET_DOWNLOAD_BACKOFF_MS = [400, 1200] as const;

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
  wordnet: {
    url: WORDNET_NLTK_URL,
    file: "wordnet31.zip",
  },
} as const;

export type DatasetId = keyof typeof DATASETS;

export interface DatasetMirror {
  url: string;
  file: string;
  timeoutMs: number;
}

/** Per-attempt timeout. WordNet's Princeton mirror is only used after the NLTK zip fails. */
export const DATASET_TIMEOUT_MS: Record<DatasetId, number> = {
  cedict: 60_000,
  jmdict: 60_000,
  kanjidic: 60_000,
  kengdic: 60_000,
  wordnet: 30_000,
};

const WORDNET_FALLBACK_TIMEOUT_MS = 60_000;

const DICTIONARY_USER_AGENT = "ryOS-dictionary/1.0 (+https://os.ryo.lu)";

export function datasetMirrors(id: DatasetId): readonly DatasetMirror[] {
  if (id === "wordnet") {
    return [
      { url: WORDNET_NLTK_URL, file: "wordnet31.zip", timeoutMs: DATASET_TIMEOUT_MS.wordnet },
      {
        url: WORDNET_PRINCETON_URL,
        file: "wn3.1.dict.tar.gz",
        timeoutMs: WORDNET_FALLBACK_TIMEOUT_MS,
      },
    ];
  }
  const source = DATASETS[id];
  return [{ url: source.url, file: source.file, timeoutMs: DATASET_TIMEOUT_MS[id] }];
}

/** On-disk names that satisfy this dataset, primary file first. */
export function datasetCacheFiles(id: DatasetId): readonly string[] {
  return datasetMirrors(id).map((mirror) => mirror.file);
}

function downloadErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timed out";
    return error.message;
  }
  return String(error);
}

async function fetchMirror(
  mirror: DatasetMirror,
  fetchImpl: typeof fetch
): Promise<Uint8Array> {
  const response = await fetchImpl(mirror.url, {
    signal: AbortSignal.timeout(mirror.timeoutMs),
    headers: { "User-Agent": DICTIONARY_USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("empty response");
  return bytes;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Download one dataset. Each mirror gets three attempts with a short backoff.
 * WordNet tries the NLTK zip first, then Princeton's tar.gz.
 */
export async function fetchDatasetBytes(
  id: DatasetId,
  options?: {
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<{ bytes: Uint8Array; file: string; url: string }> {
  const fetchImpl = options?.fetch ?? fetch;
  const sleep = options?.sleep ?? defaultSleep;
  const errors: string[] = [];

  for (const mirror of datasetMirrors(id)) {
    for (let attempt = 1; attempt <= DATASET_DOWNLOAD_ATTEMPTS; attempt++) {
      try {
        const bytes = await fetchMirror(mirror, fetchImpl);
        return { bytes, file: mirror.file, url: mirror.url };
      } catch (error) {
        const message = downloadErrorMessage(error);
        errors.push(`${mirror.file} attempt ${attempt}: ${message}`);
        console.warn(`[dictionary] ${id} ${mirror.file} attempt ${attempt} failed: ${message}`);
        if (attempt < DATASET_DOWNLOAD_ATTEMPTS) {
          await sleep(DATASET_DOWNLOAD_BACKOFF_MS[attempt - 1] ?? 1000);
        }
      }
    }
  }

  throw new Error(`Dictionary dataset ${id} download failed (${errors.join("; ")})`);
}
