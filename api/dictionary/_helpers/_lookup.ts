import {
  detectDictionaryLanguage,
  hasCjkScript,
  isHanOnlyQuery,
  normalizeDictionaryQuery,
  type DictionaryEntry,
  type DictionaryKanjiInfo,
  type DictionaryLanguage,
  type DictionaryLookupResponse,
  type DictionaryQueryLanguage,
  type DictionarySource,
} from "../../../src/shared/dictionary.js";
import { normalizePinyinSearchKey } from "../../../src/utils/zhuyin.js";
import { hiraganaKey } from "./_datasets.js";
import type { DictionaryIndex } from "./_index.js";

export interface DictionaryLookupDeps {
  getIndex: (lang: DictionaryLanguage) => Promise<DictionaryIndex>;
  getKanjiInfo?: () => Promise<Map<string, DictionaryKanjiInfo>>;
  fetchFreeDictionary?: (word: string) => Promise<DictionaryEntry | null>;
  fetchSynonyms?: (word: string) => Promise<string[]>;
  fetchWiktionary?: (headword: string, lang: DictionaryLanguage) => Promise<DictionaryEntry | null>;
  onRemoteError?: (source: DictionarySource, error: unknown) => void;
}

const MAX_ENTRIES = 12;
const HAN_CHAR_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

async function safely<T>(
  source: DictionarySource,
  deps: DictionaryLookupDeps,
  task: (() => Promise<T>) | undefined,
  fallback: T
): Promise<T> {
  if (!task) return fallback;
  try {
    return await task();
  } catch (error) {
    deps.onRemoteError?.(source, error);
    return fallback;
  }
}

function emptyResponse(query: string, lang: DictionaryLanguage): DictionaryLookupResponse {
  return {
    query,
    lang,
    entries: [],
    phrases: [],
    similar: [],
    suggestions: [],
    sources: [],
    notFound: true,
  };
}

/** Find entries in a CJK index for a query in any supported input form. */
export function findLocalEntries(
  index: DictionaryIndex,
  query: string,
  lang: DictionaryLanguage
): { entries: DictionaryEntry[]; segmented: boolean } {
  if (hasCjkScript(query)) {
    const exact = index.lookupHeadword(query);
    if (exact.length) return { entries: exact, segmented: false };
    const words = index.segment(query);
    if (words.length > 1 || (words.length === 1 && words[0] !== query)) {
      const entries = words
        .map((word) => index.lookupHeadword(word)[0])
        .filter((entry): entry is DictionaryEntry => !!entry);
      return { entries, segmented: true };
    }
    return { entries: [], segmented: false };
  }

  const byReading =
    lang === "zh"
      ? index.lookupReading(normalizePinyinSearchKey(query))
      : lang === "ja"
        ? index.lookupReading(hiraganaKey(query))
        : [];
  if (byReading.length) return { entries: byReading, segmented: false };
  return { entries: index.lookupGloss(query), segmented: false };
}

function attachKanji(entries: DictionaryEntry[], kanji: Map<string, DictionaryKanjiInfo>) {
  for (const entry of entries.slice(0, 3)) {
    const literals = Array.from(new Set(Array.from(entry.headword).filter((c) => HAN_CHAR_RE.test(c))));
    const infos = literals.map((c) => kanji.get(c)).filter((i): i is DictionaryKanjiInfo => !!i);
    if (infos.length) entry.kanji = infos;
  }
}

function mergeExamples(target: DictionaryEntry, supplement: DictionaryEntry | null): boolean {
  if (!supplement) return false;
  const examples = supplement.senses.flatMap((sense) => sense.examples ?? []).slice(0, 4);
  if (!examples.length || !target.senses[0]) return false;
  const sense = target.senses[0];
  sense.examples = [...(sense.examples ?? []), ...examples].slice(0, 6);
  return true;
}

async function lookupEnglish(
  query: string,
  deps: DictionaryLookupDeps
): Promise<DictionaryLookupResponse> {
  const word = query.toLowerCase();
  const [entry, synonyms] = await Promise.all([
    safely("free-dictionary", deps, deps.fetchFreeDictionary && (() => deps.fetchFreeDictionary!(word)), null),
    safely("datamuse", deps, deps.fetchSynonyms && (() => deps.fetchSynonyms!(word)), [] as string[]),
  ]);
  const response = emptyResponse(query, "en");
  if (entry) {
    const merged = Array.from(new Set([...(entry.synonyms ?? []), ...synonyms])).slice(0, 20);
    if (merged.length) entry.synonyms = merged;
    response.entries = [entry];
    response.sources.push("free-dictionary");
    response.notFound = false;
  }
  if (synonyms.length) {
    response.sources.push("datamuse");
    response.similar = synonyms.slice(0, 12).map((headword) => ({ headword, gloss: "", lang: "en" }));
  }
  return response;
}

const LOCAL_SOURCE: Record<Exclude<DictionaryLanguage, "en">, DictionarySource> = {
  zh: "cc-cedict",
  ja: "jmdict",
  ko: "kengdic",
};

async function lookupCjk(
  query: string,
  lang: Exclude<DictionaryLanguage, "en">,
  deps: DictionaryLookupDeps
): Promise<DictionaryLookupResponse & { wholeWordMatch: boolean }> {
  const response = emptyResponse(query, lang);
  let index: DictionaryIndex | null = null;
  try {
    index = await deps.getIndex(lang);
  } catch (error) {
    deps.onRemoteError?.(LOCAL_SOURCE[lang], error);
  }
  const { entries, segmented } = index
    ? findLocalEntries(index, query, lang)
    : { entries: [], segmented: false };
  response.entries = entries.slice(0, MAX_ENTRIES);
  if (response.entries.length) response.sources.push(LOCAL_SOURCE[lang]);

  const top = response.entries[0];
  const wiktionaryHeadword =
    !segmented && (top || hasCjkScript(query))
      ? lang === "zh"
        ? top?.traditional ?? query
        : top?.headword ?? query
      : null;

  const [wiktionary, kanji] = await Promise.all([
    wiktionaryHeadword
      ? safely(
          "wiktionary",
          deps,
          deps.fetchWiktionary && (() => deps.fetchWiktionary!(wiktionaryHeadword, lang)),
          null
        )
      : Promise.resolve(null),
    lang === "ja"
      ? safely("kanjidic2", deps, deps.getKanjiInfo, null)
      : Promise.resolve(null),
  ]);

  if (wiktionary) {
    if (lang === "ko") {
      wiktionary.headword = top?.headword ?? wiktionary.headword;
      if (top?.hanja) wiktionary.hanja = top.hanja;
      response.entries.unshift(wiktionary);
      response.sources.push("wiktionary");
    } else if (top && mergeExamples(top, wiktionary)) {
      response.sources.push("wiktionary");
    } else if (!top) {
      response.entries.push(wiktionary);
      response.sources.push("wiktionary");
    }
  }
  if (kanji && response.entries.length) {
    attachKanji(response.entries, kanji);
    if (response.entries.some((entry) => entry.kanji?.length)) response.sources.push("kanjidic2");
  }

  if (index && top && !segmented) {
    const compoundKey = hasCjkScript(query) ? query : top.headword;
    response.phrases = index.findCompounds(compoundKey, 12);
    response.similar = index.findSimilar(top, 10);
  }
  response.notFound = response.entries.length === 0;
  if (index && response.notFound && hasCjkScript(query)) {
    response.suggestions = index.suggest(Array.from(query)[0] ?? query, 8);
  }
  return Object.assign(response, { wholeWordMatch: !segmented && !response.notFound });
}

function withoutMatchFlag({
  wholeWordMatch: _wholeWordMatch,
  ...response
}: DictionaryLookupResponse & { wholeWordMatch: boolean }): DictionaryLookupResponse {
  return response;
}

export async function lookupDictionary(
  rawQuery: string,
  preferred: DictionaryQueryLanguage,
  deps: DictionaryLookupDeps
): Promise<DictionaryLookupResponse> {
  const query = normalizeDictionaryQuery(rawQuery);
  const lang = detectDictionaryLanguage(query, preferred);
  if (!query) return emptyResponse(query, lang);
  if (lang === "en") return lookupEnglish(query, deps);
  const response = await lookupCjk(query, lang, deps);
  // Han-only text defaults to Chinese; in auto mode prefer Japanese when only
  // JMdict knows the whole word (学習, 手紙 in its Japanese sense, …).
  if (preferred === "auto" && lang === "zh" && !response.wholeWordMatch && isHanOnlyQuery(query)) {
    const japanese = await lookupCjk(query, "ja", deps);
    if (japanese.wholeWordMatch) return withoutMatchFlag(japanese);
  }
  return withoutMatchFlag(response);
}
