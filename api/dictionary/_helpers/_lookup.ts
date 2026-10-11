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
import { dedupeDictionaryEntries, dedupeDictionaryLookup } from "../../../src/shared/dictionaryMerge.js";
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
import { attachChineseHanzi } from "./_hanzi.js";
import type { DictionaryIndex } from "./_index.js";
import { lookupWordNet } from "./_wordnet.js";

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
/**
 * WordNet already has the definition. Phonetics, audio, and extra examples
 * may arrive from the network, but only within this window — a slow or failed
 * remote source never turns a local hit into not-found.
 */
export const ENRICHMENT_DEADLINE_MS = 400;
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

function takeExamples(entry: DictionaryEntry | null | undefined): { text: string }[] {
  if (!entry) return [];
  return entry.senses.flatMap((sense) => sense.examples ?? []).filter((example) => example.text);
}

async function enrichWordNetHit(
  query: string,
  entry: DictionaryEntry,
  deps: DictionaryLookupDeps
): Promise<DictionaryLookupResponse> {
  const head = entry.headword;
  const freeP = safely(
    "free-dictionary",
    deps,
    deps.fetchFreeDictionary && (() => deps.fetchFreeDictionary!(head)),
    null
  );
  const wikiP = safely(
    "wiktionary",
    deps,
    deps.fetchWiktionary && (() => deps.fetchWiktionary!(head, "en")),
    null
  );
  const synonymsP = safely(
    "datamuse",
    deps,
    deps.fetchSynonyms && (() => deps.fetchSynonyms!(head)),
    [] as string[]
  );
  const [free, wiki, extraSynonyms] = await Promise.all([
    withDeadline(freeP, ENRICHMENT_DEADLINE_MS),
    withDeadline(wikiP, ENRICHMENT_DEADLINE_MS),
    withDeadline(synonymsP, ENRICHMENT_DEADLINE_MS),
  ]);

  let usedFree = false;
  if (free?.ipa) {
    entry.ipa = free.ipa;
    usedFree = true;
  }
  if (free?.audioUrl) {
    entry.audioUrl = free.audioUrl;
    usedFree = true;
  }
  const freeExamples = takeExamples(free);
  const wikiExamples = takeExamples(wiki);
  if ((freeExamples.length || wikiExamples.length) && entry.senses[0]) {
    const seen = new Set((entry.senses[0].examples ?? []).map((example) => example.text));
    const merged = [...(entry.senses[0].examples ?? [])];
    for (const example of [...freeExamples, ...wikiExamples]) {
      if (seen.has(example.text)) continue;
      seen.add(example.text);
      merged.push(example);
      if (example && freeExamples.includes(example)) usedFree = true;
      if (merged.length >= 4) break;
    }
    entry.senses[0].examples = merged;
  }

  const synonyms = Array.from(new Set([...(entry.synonyms ?? []), ...(extraSynonyms ?? [])])).slice(0, 20);
  if (synonyms.length) entry.synonyms = synonyms;

  const response = emptyResponse(query, "en");
  response.entries = [entry];
  response.notFound = false;
  response.sources = ["wordnet"];
  if (usedFree) response.sources.push("free-dictionary");
  if (wikiExamples.length) response.sources.push("wiktionary");
  if (extraSynonyms && extraSynonyms.length) response.sources.push("datamuse");
  response.similar = (entry.synonyms ?? []).slice(0, 12).map((headword) => ({
    headword,
    gloss: "",
    lang: "en",
  }));
  return response;
}

async function lookupEnglish(
  query: string,
  deps: DictionaryLookupDeps
): Promise<DictionaryLookupResponse> {
  const word = query.toLowerCase();
  let index: DictionaryIndex | null = null;
  try {
    index = await deps.getIndex("en");
  } catch (error) {
    deps.onRemoteError?.("wordnet", error);
  }
  const local = index ? lookupWordNet(index, word) : null;
  if (local) return enrichWordNetHit(query, local, deps);
  return lookupEnglishRemote(query, deps);
}

async function lookupEnglishRemote(
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

export interface DictionaryLookupTimings {
  indexSearchMs: number;
  segmentMs: number;
  findCompoundsMs: number;
  wiktionaryMs: number;
  kanjidicMs: number;
  /** Time to probe the other Han index in auto mode. Zero for an explicit language. */
  autoSecondPassMs: number;
  /** Wall time until the local result is ready. Wiktionary is not included. */
  totalMs: number;
}

export interface DictionaryLookupOptions {
  /** UI locale. A `ja` locale prefers Japanese when both Han indexes whole-match. */
  locale?: string;
}

export interface DictionaryLookupPending {
  /** Local index result. Never waits on Wiktionary. */
  local: DictionaryLookupResponse;
  /** Local result plus Wiktionary, when enrichment can still change it. */
  final: Promise<DictionaryLookupResponse>;
  enrichmentPending: boolean;
  timings: DictionaryLookupTimings;
}

export function dictionaryLookupTimingEnabled(): boolean {
  const flag = process.env.DICTIONARY_LOOKUP_TIMING;
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export function prefersJapaneseLocale(locale?: string): boolean {
  return (locale ?? "").trim().toLowerCase().startsWith("ja");
}

/**
 * Han-only auto mode. Kana is not a tie: a kana query never reaches this
 * function. Japanese wins when only JMdict has the whole word; a `ja` locale
 * also wins ties (both match, or neither matches).
 */
export function chooseAutoCjkLanguage(
  chineseWhole: boolean,
  japaneseWhole: boolean,
  locale?: string
): "zh" | "ja" {
  const preferJa = prefersJapaneseLocale(locale);
  if (chineseWhole && japaneseWhole) return preferJa ? "ja" : "zh";
  if (japaneseWhole) return "ja";
  if (chineseWhole) return "zh";
  return preferJa ? "ja" : "zh";
}

export function dictionaryLookupCacheId(queryLang: string, locale?: string): string {
  if (queryLang === "auto" && prefersJapaneseLocale(locale)) return "auto:ja";
  return queryLang;
}

const inflightLookups = new Map<string, Promise<DictionaryLookupResponse>>();

/** Keep the in-flight final result until `persist` finishes so enrich can share it. */
export function publishDictionaryLookup(
  key: string,
  final: Promise<DictionaryLookupResponse>,
  persist: (result: DictionaryLookupResponse) => Promise<void>
): void {
  const published = final.then(async (result) => {
    await persist(result);
    return result;
  });
  inflightLookups.set(key, published);
  void published.catch(() => undefined).finally(() => {
    if (inflightLookups.get(key) === published) inflightLookups.delete(key);
  });
}

export function inflightDictionaryLookup(key: string): Promise<DictionaryLookupResponse> | undefined {
  return inflightLookups.get(key);
}

/** Test hook. */
export function clearInflightDictionaryLookups(): void {
  inflightLookups.clear();
}

function blankTimings(): DictionaryLookupTimings {
  return {
    indexSearchMs: 0,
    segmentMs: 0,
    findCompoundsMs: 0,
    wiktionaryMs: 0,
    kanjidicMs: 0,
    autoSecondPassMs: 0,
    totalMs: 0,
  };
}

function settled(
  response: DictionaryLookupResponse,
  timings: DictionaryLookupTimings,
  started: number
): DictionaryLookupPending {
  const deduped = dedupeDictionaryLookup(response);
  timings.totalMs = performance.now() - started;
  return {
    local: deduped,
    final: Promise.resolve(deduped),
    enrichmentPending: false,
    timings,
  };
}

interface BuiltCjk {
  response: DictionaryLookupResponse;
  segmented: boolean;
  wholeWordMatch: boolean;
  wikiHeadword: string | null;
  indexSearchMs: number;
  segmentMs: number;
  findCompoundsMs: number;
  kanjidicMs: number;
}

function copyPhases(target: DictionaryLookupTimings, built: BuiltCjk) {
  target.indexSearchMs = built.indexSearchMs;
  target.segmentMs = built.segmentMs;
  target.findCompoundsMs = built.findCompoundsMs;
  target.kanjidicMs = built.kanjidicMs;
}

function wikiHeadwordFor(
  query: string,
  lang: Exclude<DictionaryLanguage, "en">,
  top: DictionaryEntry | undefined,
  segmented: boolean
): string | null {
  if (segmented || !(top || hasCjkScript(query))) return null;
  return lang === "zh" ? (top?.traditional ?? query) : (top?.headword ?? query);
}

/** zh/ja Wiktionary only adds examples. A local example already answers that. */
function wiktionaryCanChange(
  lang: Exclude<DictionaryLanguage, "en">,
  top: DictionaryEntry | undefined,
  headword: string | null
): boolean {
  if (!headword) return false;
  if (lang !== "ko" && top?.senses[0]?.examples?.length) return false;
  return true;
}

function insertSource(sources: DictionarySource[], source: DictionarySource) {
  if (sources.includes(source)) return;
  const kanjiAt = sources.indexOf("kanjidic2");
  if (source === "wiktionary" && kanjiAt >= 0) sources.splice(kanjiAt, 0, source);
  else sources.push(source);
}

function applyWiktionary(
  response: DictionaryLookupResponse,
  wiktionary: DictionaryEntry | null,
  lang: Exclude<DictionaryLanguage, "en">
): DictionaryLookupResponse {
  if (!wiktionary) return response;
  const entries = response.entries.slice();
  const sources = response.sources.slice();
  const top = entries[0];
  let changed = false;
  if (lang === "ko") {
    // Fold Wiktionary into the kengdic row already in the list. Prepending a
    // second card made the same headword show up twice after enrichment.
    const next = dedupeDictionaryEntries([...entries, wiktionary]);
    if (next.length !== entries.length || next.some((entry, index) => entry !== entries[index])) {
      entries.splice(0, entries.length, ...next);
      insertSource(sources, "wiktionary");
      changed = true;
    }
  } else if (top) {
    const sense = top.senses[0];
    const copy: DictionaryEntry = {
      ...top,
      senses: top.senses.map((item, index) =>
        index === 0 ? { ...item, examples: sense?.examples?.slice() } : item
      ),
    };
    if (mergeExamples(copy, wiktionary)) {
      entries[0] = copy;
      insertSource(sources, "wiktionary");
      changed = true;
    }
  } else {
    entries.push(wiktionary);
    insertSource(sources, "wiktionary");
    changed = true;
  }
  if (!changed) return response;
  const deduped = dedupeDictionaryEntries(entries);
  return {
    ...response,
    entries: deduped,
    sources,
    notFound: deduped.length === 0,
    suggestions: deduped.length ? [] : response.suggestions,
  };
}

function startWiktionary(
  headword: string | null,
  lang: Exclude<DictionaryLanguage, "en">,
  deps: DictionaryLookupDeps
): Promise<DictionaryEntry | null> {
  if (!headword || !deps.fetchWiktionary) return Promise.resolve(null);
  return safely("wiktionary", deps, () => deps.fetchWiktionary!(headword, lang), null);
}

async function buildCjk(
  query: string,
  lang: Exclude<DictionaryLanguage, "en">,
  deps: DictionaryLookupDeps
): Promise<BuiltCjk> {
  const response = emptyResponse(query, lang);
  let index: DictionaryIndex | null = null;
  try {
    index = await deps.getIndex(lang);
  } catch (error) {
    deps.onRemoteError?.(LOCAL_SOURCE[lang], error);
  }
  let indexSearchMs = 0;
  let segmentMs = 0;
  let segmented = false;
  if (index) {
    if (hasCjkScript(query)) {
      const exactStarted = performance.now();
      const exact = index.lookupHeadword(query);
      indexSearchMs += performance.now() - exactStarted;
      if (exact.length) {
        response.entries = exact.slice(0, MAX_ENTRIES);
      } else {
        const segmentStarted = performance.now();
        const words = index.segment(query);
        segmentMs = performance.now() - segmentStarted;
        if (words.length > 1 || (words.length === 1 && words[0] !== query)) {
          segmented = true;
          const entries: DictionaryEntry[] = [];
          for (const word of words) {
            const hit = index.lookupHeadword(word)[0];
            if (hit) entries.push(hit);
            if (entries.length >= MAX_ENTRIES) break;
          }
          response.entries = entries;
        }
      }
    } else {
      const readingStarted = performance.now();
      const { entries } = findLocalEntries(index, query, lang);
      indexSearchMs += performance.now() - readingStarted;
      response.entries = entries.slice(0, MAX_ENTRIES);
    }
  }
  if (response.entries.length) response.sources.push(LOCAL_SOURCE[lang]);

  let kanjidicMs = 0;
  if (lang === "ja" && response.entries.length && deps.getKanjiInfo) {
    const kanjiStarted = performance.now();
    const kanji = await safely("kanjidic2", deps, deps.getKanjiInfo, null);
    kanjidicMs = performance.now() - kanjiStarted;
    if (kanji) {
      attachKanji(response.entries, kanji);
      if (response.entries.some((entry) => entry.kanji?.length)) response.sources.push("kanjidic2");
    }
  }

  const top = response.entries[0];
  let findCompoundsMs = 0;
  if (index && top && !segmented) {
    const compoundStarted = performance.now();
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
    findCompoundsMs = performance.now() - compoundStarted;
  }
  if (lang === "zh" && index && response.entries.length) {
    attachChineseHanzi(response.entries, index);
  }
  response.entries = dedupeDictionaryEntries(response.entries);
  response.notFound = response.entries.length === 0;
  if (index && response.notFound && hasCjkScript(query)) {
    response.suggestions = index.suggest(Array.from(query)[0] ?? query, 8);
  }
  return {
    response,
    segmented,
    wholeWordMatch: !segmented && Boolean(top),
    wikiHeadword: wikiHeadwordFor(query, lang, top, segmented),
    indexSearchMs,
    segmentMs,
    findCompoundsMs,
    kanjidicMs,
  };
}

function enrichBuilt(
  built: BuiltCjk,
  lang: Exclude<DictionaryLanguage, "en">,
  deps: DictionaryLookupDeps,
  timings: DictionaryLookupTimings
): DictionaryLookupPending {
  const local = built.response;
  const canChange =
    Boolean(deps.fetchWiktionary) && wiktionaryCanChange(lang, local.entries[0], built.wikiHeadword);
  if (!canChange || !built.wikiHeadword) {
    return {
      local,
      final: Promise.resolve(local),
      enrichmentPending: false,
      timings,
    };
  }
  const headword = built.wikiHeadword;
  const started = performance.now();
  const final = startWiktionary(headword, lang, deps).then((wiki) => {
    timings.wiktionaryMs += performance.now() - started;
    return applyWiktionary(local, wiki, lang);
  });
  return { local, final, enrichmentPending: true, timings };
}

async function beginHanAuto(
  query: string,
  deps: DictionaryLookupDeps,
  locale: string | undefined,
  started: number
): Promise<DictionaryLookupPending> {
  const timings = blankTimings();
  let zhMs = 0;
  let jaMs = 0;
  const [chinese, japanese] = await Promise.all([
    (async () => {
      const t = performance.now();
      const built = await buildCjk(query, "zh", deps);
      zhMs = performance.now() - t;
      return built;
    })(),
    (async () => {
      const t = performance.now();
      const built = await buildCjk(query, "ja", deps);
      jaMs = performance.now() - t;
      return built;
    })(),
  ]);
  const chosenLang = chooseAutoCjkLanguage(
    chinese.wholeWordMatch,
    japanese.wholeWordMatch,
    locale
  );
  const chosen = chosenLang === "ja" ? japanese : chinese;
  copyPhases(timings, chosen);
  timings.autoSecondPassMs = chosenLang === "zh" ? jaMs : zhMs;
  timings.totalMs = performance.now() - started;

  // An empty, unsegmented Chinese probe used to wait for Wiktionary before
  // falling through to Japanese. The local preview uses the index-only choice;
  // `final` still applies that Wiktionary override so the cached result matches.
  const zhWikiDecides =
    !chinese.segmented &&
    chinese.response.entries.length === 0 &&
    hasCjkScript(query) &&
    Boolean(deps.fetchWiktionary);

  if (!zhWikiDecides) return enrichBuilt(chosen, chosenLang, deps, timings);

  // Japanese already has the word and the UI is in Japanese: don't wait to
  // discover whether Wiktionary also has a Chinese page.
  if (prefersJapaneseLocale(locale) && japanese.wholeWordMatch) {
    return enrichBuilt(japanese, "ja", deps, timings);
  }

  const final = (async () => {
    const wikiStarted = performance.now();
    const zhWiki = await startWiktionary(chinese.wikiHeadword, "zh", deps);
    timings.wiktionaryMs += performance.now() - wikiStarted;
    const zhFinal = applyWiktionary(chinese.response, zhWiki, "zh");
    const zhWhole = zhFinal.entries.length > 0;
    if (zhWhole && !japanese.wholeWordMatch) return zhFinal;
    const jaFinal = await enrichBuilt(japanese, "ja", deps, timings).final;
    const jaWhole = !japanese.segmented && jaFinal.entries.length > 0;
    if (zhWhole && jaWhole) return prefersJapaneseLocale(locale) ? jaFinal : zhFinal;
    if (jaWhole) return jaFinal;
    if (zhWhole) return zhFinal;
    return prefersJapaneseLocale(locale) ? jaFinal : zhFinal;
  })();

  return {
    local: chosen.response,
    final,
    enrichmentPending: true,
    timings,
  };
}

export async function beginDictionaryLookup(
  rawQuery: string,
  preferred: DictionaryQueryLanguage,
  deps: DictionaryLookupDeps,
  options: DictionaryLookupOptions = {}
): Promise<DictionaryLookupPending> {
  const started = performance.now();
  const query = normalizeDictionaryQuery(rawQuery);
  const lang = detectDictionaryLanguage(query, preferred);
  if (!query) return settled(emptyResponse(query, lang), blankTimings(), started);
  if (lang === "en") {
    const response = await lookupEnglish(query, deps);
    return settled(response, blankTimings(), started);
  }
  // Kana (and Hangul) already picked a single language. Han-only auto probes both.
  if (preferred === "auto" && isHanOnlyQuery(query)) {
    return beginHanAuto(query, deps, options.locale, started);
  }
  const timings = blankTimings();
  const built = await buildCjk(query, lang, deps);
  copyPhases(timings, built);
  timings.totalMs = performance.now() - started;
  return enrichBuilt(built, lang, deps, timings);
}

export async function lookupDictionary(
  rawQuery: string,
  preferred: DictionaryQueryLanguage,
  deps: DictionaryLookupDeps,
  options?: DictionaryLookupOptions
): Promise<DictionaryLookupResponse> {
  const pending = await beginDictionaryLookup(rawQuery, preferred, deps, options);
  return pending.final;
}
