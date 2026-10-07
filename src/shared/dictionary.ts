/**
 * Runtime-neutral Dictionary app contracts shared by `api/dictionary/*` and
 * `src/apps/dictionary/*`.
 */

export const DICTIONARY_LANGUAGES = ["en", "zh", "ja", "ko"] as const;
export type DictionaryLanguage = (typeof DICTIONARY_LANGUAGES)[number];
export type DictionaryQueryLanguage = DictionaryLanguage | "auto";
export const DICTIONARY_QUERY_LANGUAGES: readonly DictionaryQueryLanguage[] = [
  "auto",
  ...DICTIONARY_LANGUAGES,
];

export const DICTIONARY_SOURCES = [
  "cc-cedict",
  "jmdict",
  "kanjidic2",
  "kengdic",
  "wiktionary",
  "free-dictionary",
  "datamuse",
  "ai",
] as const;
export type DictionarySource = (typeof DICTIONARY_SOURCES)[number];

export interface DictionarySourceInfo {
  name: string;
  license: string;
  url: string;
}

export const DICTIONARY_SOURCE_INFO: Record<DictionarySource, DictionarySourceInfo> = {
  "cc-cedict": {
    name: "CC-CEDICT",
    license: "CC BY-SA 4.0",
    url: "https://www.mdbg.net/chinese/dictionary?page=cedict",
  },
  jmdict: {
    name: "JMdict",
    license: "CC BY-SA 4.0 (EDRDG)",
    url: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project",
  },
  kanjidic2: {
    name: "KANJIDIC2",
    license: "CC BY-SA 4.0 (EDRDG)",
    url: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project",
  },
  kengdic: {
    name: "kengdic",
    license: "MPL 2.0 / LGPL 2.0+",
    url: "https://github.com/garfieldnate/kengdic",
  },
  wiktionary: {
    name: "Wiktionary",
    license: "CC BY-SA 4.0",
    url: "https://en.wiktionary.org",
  },
  "free-dictionary": {
    name: "Free Dictionary API (Wiktionary)",
    license: "CC BY-SA 3.0",
    url: "https://dictionaryapi.dev",
  },
  datamuse: {
    name: "Datamuse",
    license: "Free API",
    url: "https://www.datamuse.com/api/",
  },
  ai: {
    name: "AI",
    license: "Generated — may contain mistakes",
    url: "https://os.ryo.lu",
  },
};

export interface DictionaryExample {
  text: string;
  /** Kana (ja), tone-marked pinyin (zh) or romanization (ko) when known. */
  reading?: string;
  /** ja: per-kanji readings for furigana rendering. */
  furigana?: { text: string; reading?: string }[];
  translation?: string;
}

export interface DictionarySense {
  partOfSpeech?: string;
  glosses: string[];
  examples?: DictionaryExample[];
  synonyms?: string[];
  antonyms?: string[];
  notes?: string[];
}

export interface DictionaryKanjiInfo {
  literal: string;
  meanings: string[];
  onyomi: string[];
  kunyomi: string[];
  strokeCount?: number;
  grade?: number;
  jlpt?: number;
  frequency?: number;
}

export interface DictionaryEntry {
  /** Stable id, `${source}:${key}` — used for favorites. */
  id: string;
  lang: DictionaryLanguage;
  headword: string;
  /** zh: both scripts from CC-CEDICT. */
  traditional?: string;
  simplified?: string;
  /** ja: other written forms; en: spelling variants. */
  alternates?: string[];
  /** zh: numbered pinyin ("xue2 xi2"); ja: kana; ko: unused (Hangul is phonetic). */
  reading?: string;
  /** ja: alternate kana readings. */
  readings?: string[];
  /** ko: Sino-Korean spelling. */
  hanja?: string;
  /** en: IPA transcription. */
  ipa?: string;
  audioUrl?: string;
  senses: DictionarySense[];
  synonyms?: string[];
  tags?: string[];
  kanji?: DictionaryKanjiInfo[];
  source: DictionarySource;
}

/** Compact row for compounds / similar words lists. */
export interface DictionaryPhrase {
  headword: string;
  reading?: string;
  gloss: string;
  lang: DictionaryLanguage;
  traditional?: string;
  simplified?: string;
}

export interface DictionaryLookupResponse {
  query: string;
  lang: DictionaryLanguage;
  entries: DictionaryEntry[];
  /** Compounds / set phrases containing the headword. */
  phrases: DictionaryPhrase[];
  /** Words sharing a gloss with the top entry (CJK "synonyms"). */
  similar: DictionaryPhrase[];
  /** Nearby headwords when nothing matched exactly. */
  suggestions: string[];
  sources: DictionarySource[];
  notFound: boolean;
}

export type DictionaryAiMode = "fallback" | "extras";

export interface DictionaryAiExtras {
  usageNotes: string;
  nuance?: string;
  synonyms: string[];
  examples: DictionaryExample[];
}

export interface DictionaryAiResponse {
  word: string;
  lang: DictionaryLanguage;
  mode: DictionaryAiMode;
  entry?: DictionaryEntry;
  extras?: DictionaryAiExtras;
}

export const DICTIONARY_QUERY_MAX_LENGTH = 64;

const HANGUL_RE = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const KANA_RE = /[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff\uff66-\uff9f]/;
const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3005]/;

export function isDictionaryLanguage(value: unknown): value is DictionaryLanguage {
  return typeof value === "string" && (DICTIONARY_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Decide which dictionary a query belongs to. Script wins where it is
 * unambiguous (Hangul → ko, kana → ja); Han-only text follows the preferred
 * CJK language (default zh); Latin text stays in the preferred language so
 * pinyin / romaji / English reverse lookups work, defaulting to English.
 */
export function detectDictionaryLanguage(
  query: string,
  preferred: DictionaryQueryLanguage = "auto"
): DictionaryLanguage {
  if (HANGUL_RE.test(query)) return "ko";
  if (KANA_RE.test(query)) return "ja";
  if (HAN_RE.test(query)) {
    return preferred === "ja" || preferred === "ko" ? preferred : "zh";
  }
  return preferred === "auto" ? "en" : preferred;
}

/** Han characters only (no kana / Hangul) — could be Chinese or Japanese. */
export function isHanOnlyQuery(query: string): boolean {
  return HAN_RE.test(query) && !HANGUL_RE.test(query) && !KANA_RE.test(query);
}

export function hasCjkScript(query: string): boolean {
  return HANGUL_RE.test(query) || KANA_RE.test(query) || HAN_RE.test(query);
}

export function normalizeDictionaryQuery(query: string): string {
  return query
    .normalize("NFKC")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DICTIONARY_QUERY_MAX_LENGTH);
}
