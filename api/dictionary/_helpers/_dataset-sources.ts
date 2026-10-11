/**
 * Download locations for the offline dictionaries.
 *
 * WordNet 3.1 database © 2011 Princeton University, used under the WordNet
 * License (redistribution with the Princeton copyright notice and disclaimer).
 * The notice ships in the header of the published database files.
 */

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
  wordnet: {
    url: "https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz",
    file: "wn3.1.dict.tar.gz",
  },
} as const;

export type DatasetId = keyof typeof DATASETS;

/** WordNet is the largest single file; give it longer than the CJK downloads. */
export const DATASET_TIMEOUT_MS: Record<DatasetId, number> = {
  cedict: 60_000,
  jmdict: 60_000,
  kanjidic: 60_000,
  kengdic: 60_000,
  wordnet: 120_000,
};
