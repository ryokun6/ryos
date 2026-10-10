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
import {
  dropFormOfGlosses,
  englishLemmaCandidates,
  formOfLemmas,
  hasSubstantiveDefinition,
  leadingFormOfLemma,
  mergeSurfaceSenses,
} from "./_english.js";
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
/** Prefix compounds shown with the exact hit (大 → 大一统, 大丈夫, …). */
const MAX_COMPOUND_ENTRIES = 1200;
const HAN_CHAR_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
/**
 * dictionaryapi.dev often 404s or hangs on common words. Wait this long for a
 * real Free Dictionary hit, then use Wiktionary instead of blocking on it.
 */
const FREE_DICTIONARY_GRACE_MS = 1000;
/** Surface form plus a few lemmas (running → run, took → take). */
const MAX_ENGLISH_ATTEMPTS = 4;

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
    timer.unref?.();
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

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

interface EnglishHit {
  entry: DictionaryEntry | null;
  source: "free-dictionary" | "wiktionary" | null;
}

async function loadEnglishWord(word: string, deps: DictionaryLookupDeps): Promise<EnglishHit> {
  const freeP = safely(
    "free-dictionary",
    deps,
    deps.fetchFreeDictionary && (() => deps.fetchFreeDictionary!(word)),
    null
  );
  const freeFast = await withDeadline(freeP, FREE_DICTIONARY_GRACE_MS);
  if (hasSubstantiveDefinition(freeFast)) {
    return { entry: freeFast, source: "free-dictionary" };
  }

  const wiki = await safely(
    "wiktionary",
    deps,
    deps.fetchWiktionary && (() => deps.fetchWiktionary!(word, "en")),
    null
  );
  if (hasSubstantiveDefinition(wiki)) {
    if (freeFast === undefined) {
      const late = await withDeadline(freeP, 200);
      if (hasSubstantiveDefinition(late)) return { entry: late, source: "free-dictionary" };
    }
    return { entry: wiki, source: "wiktionary" };
  }

  // A hung Free Dictionary call must not block lemma fallbacks.
  const free = freeFast === undefined ? null : freeFast;
  if (hasSubstantiveDefinition(free)) return { entry: free, source: "free-dictionary" };
  if (free?.senses.length) return { entry: free, source: "free-dictionary" };
  if (wiki?.senses.length) return { entry: wiki, source: "wiktionary" };
  return { entry: null, source: null };
}

async function finishEnglish(
  query: string,
  hit: EnglishHit,
  synonymsP: Promise<string[]>
): Promise<DictionaryLookupResponse> {
  const synonyms = (await withDeadline(synonymsP, FREE_DICTIONARY_GRACE_MS)) ?? [];
  const response = emptyResponse(query, "en");
  const entry = hit.entry;
  if (entry?.senses.some((sense) => sense.glosses.length > 0)) {
    const merged = Array.from(new Set([...(entry.synonyms ?? []), ...synonyms])).slice(0, 20);
    if (merged.length) entry.synonyms = merged;
    response.entries = [entry];
    if (hit.source) response.sources.push(hit.source);
    response.notFound = false;
  }
  if (synonyms.length) {
    if (!response.sources.includes("datamuse")) response.sources.push("datamuse");
    response.similar = synonyms.slice(0, 12).map((headword) => ({ headword, gloss: "", lang: "en" }));
  }
  return response;
}

async function lookupEnglish(
  query: string,
  deps: DictionaryLookupDeps
): Promise<DictionaryLookupResponse> {
  const word = query.toLowerCase();
  const synonymsP = safely(
    "datamuse",
    deps,
    deps.fetchSynonyms && (() => deps.fetchSynonyms!(word)),
    [] as string[]
  );

  const tried = new Set<string>();
  const queue = [word];
  let weak: EnglishHit | null = null;
  let surfaceHit: EnglishHit | null = null;

  while (queue.length > 0 && tried.size < MAX_ENGLISH_ATTEMPTS) {
    const candidate = queue.shift();
    if (!candidate || tried.has(candidate)) continue;
    tried.add(candidate);
    const hit = await loadEnglishWord(candidate, deps);

    if (candidate === word) {
      const leading = leadingFormOfLemma(hit.entry);
      if (hit.entry && leading && leading !== word && !tried.has(leading)) {
        surfaceHit = hit;
        queue.unshift(leading);
      }
      if (!hasSubstantiveDefinition(hit.entry)) {
        for (const lemma of [...formOfLemmas(hit.entry), ...englishLemmaCandidates(word)]) {
          if (!tried.has(lemma) && !queue.includes(lemma)) queue.push(lemma);
        }
      }
      if (surfaceHit || !hasSubstantiveDefinition(hit.entry)) {
        if (hit.entry && !weak) weak = hit;
        continue;
      }
      return finishEnglish(query, { ...hit, entry: dropFormOfGlosses(hit.entry!) }, synonymsP);
    }

    if (hasSubstantiveDefinition(hit.entry)) {
      const entry =
        surfaceHit?.entry && candidate !== word
          ? mergeSurfaceSenses(dropFormOfGlosses(hit.entry), surfaceHit.entry)
          : dropFormOfGlosses(hit.entry);
      return finishEnglish(query, { ...hit, entry }, synonymsP);
    }
    if (hit.entry && !weak) weak = hit;
  }

  if (surfaceHit?.entry && hasSubstantiveDefinition(surfaceHit.entry)) {
    return finishEnglish(
      query,
      { ...surfaceHit, entry: dropFormOfGlosses(surfaceHit.entry) },
      synonymsP
    );
  }
  return finishEnglish(query, weak ?? { entry: null, source: null }, synonymsP);
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
    if (hasCjkScript(query)) {
      const seen = new Set(response.entries.map((entry) => entry.id));
      for (const compound of index.findCompoundEntries(compoundKey, MAX_COMPOUND_ENTRIES)) {
        if (seen.has(compound.id)) continue;
        seen.add(compound.id);
        response.entries.push(compound);
      }
    }
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
