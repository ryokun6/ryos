import type {
  DictionaryEntry,
  DictionaryExample,
  DictionaryLanguage,
  DictionarySense,
} from "../../../src/shared/dictionary.js";
import { redisKey } from "../../../src/shared/redisKeys.js";
import { parseInlineFurigana } from "../../../src/utils/furigana.js";
import { decodeHtmlEntitiesOnce } from "../../_utils/html-entities.js";
import type { RedisLike } from "../../_utils/redis.js";

const REMOTE_TIMEOUT_MS = 6000;
const REMOTE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
const REMOTE_MISS_TTL_SECONDS = 60 * 60 * 6;
const USER_AGENT = "ryOS-dictionary/1.0 (+https://os.ryo.lu)";
/** Bump when parser output changes so cached entries are re-parsed. */
const PARSER_CACHE_VERSION = "v4";

/** HTML → plain text. Results are plain strings, so no `<`/`>` survive. */
export function stripHtml(html: string): string {
  let text = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^<>]*>/g, "");
  } while (text !== previous);
  return decodeHtmlEntitiesOnce(text)
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wiktionary parent senses embed the whole `<ol>` of subsenses. Keep the lead
 * sentence when it stands alone; otherwise leave the HTML for the subsense rows.
 */
function englishDefinitionLead(html: string): string {
  const splitAt = html.search(/<ol\b/i);
  if (splitAt < 0) return html;
  const head = html.slice(0, splitAt);
  if (stripHtml(head).length >= 12) return head;
  return html;
}

function shortenEnglishGloss(gloss: string): string {
  if (gloss.length <= 320) return gloss;
  const sentence = gloss.match(/^.{12,320}?[.!?]/);
  return (sentence ? sentence[0] : gloss.slice(0, 320)).trim();
}

function uniq(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).map((v) => v.trim()).filter(Boolean)));
}

// ============================================================================
// Free Dictionary API (English, Wiktionary-derived)
// ============================================================================

interface FreeDictionaryDefinition {
  definition: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
}

interface FreeDictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: {
    partOfSpeech?: string;
    definitions?: FreeDictionaryDefinition[];
    synonyms?: string[];
    antonyms?: string[];
  }[];
}

export function parseFreeDictionaryResponse(data: unknown): DictionaryEntry | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const rows = data as FreeDictionaryEntry[];
  const word = rows[0]?.word;
  if (!word) return null;

  const senses: DictionarySense[] = [];
  const synonyms: string[] = [];
  let ipa: string | undefined;
  let audioUrl: string | undefined;
  for (const row of rows) {
    ipa ||= row.phonetic || row.phonetics?.find((p) => p.text)?.text;
    audioUrl ||= row.phonetics?.find((p) => p.audio)?.audio || undefined;
    for (const meaning of row.meanings ?? []) {
      const definitions = meaning.definitions ?? [];
      if (definitions.length === 0) continue;
      const sense: DictionarySense = {
        partOfSpeech: meaning.partOfSpeech,
        glosses: definitions.map((d) => d.definition).filter(Boolean).slice(0, 8),
      };
      const examples = definitions
        .map((d) => d.example)
        .filter((example): example is string => !!example)
        .slice(0, 4)
        .map((text) => ({ text }));
      if (examples.length) sense.examples = examples;
      const senseSynonyms = uniq([
        ...(meaning.synonyms ?? []),
        ...definitions.flatMap((d) => d.synonyms ?? []),
      ]);
      if (senseSynonyms.length) sense.synonyms = senseSynonyms.slice(0, 12);
      const antonyms = uniq([
        ...(meaning.antonyms ?? []),
        ...definitions.flatMap((d) => d.antonyms ?? []),
      ]);
      if (antonyms.length) sense.antonyms = antonyms.slice(0, 12);
      synonyms.push(...senseSynonyms);
      senses.push(sense);
    }
  }
  if (senses.length === 0) return null;
  const entry: DictionaryEntry = {
    id: `free-dictionary:${word.toLowerCase()}`,
    lang: "en",
    headword: word,
    senses,
    source: "free-dictionary",
  };
  if (ipa) entry.ipa = ipa;
  if (audioUrl?.startsWith("https://")) entry.audioUrl = audioUrl;
  const allSynonyms = uniq(synonyms);
  if (allSynonyms.length) entry.synonyms = allSynonyms.slice(0, 16);
  return entry;
}

export function parseDatamuseResponse(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return uniq(
    data
      .map((row) => (row && typeof row === "object" ? (row as { word?: unknown }).word : null))
      .filter((word): word is string => typeof word === "string")
  );
}

// ============================================================================
// Wiktionary REST `page/definition`
// ============================================================================

interface WiktionaryDefinition {
  definition: string;
  examples?: string[];
  parsedExamples?: { example: string; translation?: string; transliteration?: string }[];
}

interface WiktionaryUsage {
  partOfSpeech?: string;
  /** "English", "Translingual", … — the `en` bucket is not English-only. */
  language?: string;
  definitions?: WiktionaryDefinition[];
}

const WIKTIONARY_LANG_CODES: Record<DictionaryLanguage, string> = {
  en: "en",
  zh: "zh",
  ja: "ja",
  ko: "ko",
};

function toExample(
  raw: { example: string; translation?: string; transliteration?: string },
  lang: DictionaryLanguage
): DictionaryExample | null {
  let exampleText = stripHtml(raw.example);
  if (!exampleText) return null;
  let inlineReading: string | undefined;
  let inlineTranslation: string | undefined;
  // Some entries inline everything: "刻苦學習／刻苦学习 ― kèkǔ xuéxí ― to study hard".
  if (lang !== "en" && !raw.translation) {
    const parts = exampleText.split(/\s+―\s+/).map((part) => part.trim());
    if (parts.length === 3) [exampleText, inlineReading, inlineTranslation] = parts;
    else if (parts.length === 2) [exampleText, inlineTranslation] = parts;
  }
  if (lang === "zh") {
    // "traditional／simplified" — the client converts to the preferred script.
    const scripts = exampleText.split("／");
    if (scripts.length === 2) exampleText = scripts[1].trim();
  }
  const example: DictionaryExample = { text: exampleText };
  if (inlineReading) example.reading = inlineReading;
  if (inlineTranslation) example.translation = inlineTranslation;
  if (lang === "ja") {
    const parsed = parseInlineFurigana(exampleText);
    example.text = parsed.text;
    if (parsed.segments.some((segment) => segment.reading)) example.furigana = parsed.segments;
  }
  if (raw.transliteration) example.reading = stripHtml(raw.transliteration);
  if (raw.translation) {
    // Wiktionary sometimes puts the romanization in `translation` when an
    // example has no English rendering.
    if (raw.translation.includes("e-transliteration")) {
      example.reading ??= stripHtml(raw.translation);
    } else {
      example.translation = stripHtml(raw.translation);
    }
  }
  return example;
}

export function parseWiktionaryResponse(
  data: unknown,
  lang: DictionaryLanguage,
  headword: string
): DictionaryEntry | null {
  if (!data || typeof data !== "object") return null;
  const usages = (data as Record<string, unknown>)[WIKTIONARY_LANG_CODES[lang]];
  if (!Array.isArray(usages)) return null;
  const senses: DictionarySense[] = [];
  for (const usage of usages as WiktionaryUsage[]) {
    if (lang === "en" && usage.language && usage.language !== "English") continue;
    if (lang === "en" && senses.length >= 6) break;
    const definitions = usage.definitions ?? [];
    const glosses: string[] = [];
    const examples: DictionaryExample[] = [];
    for (const definition of definitions) {
      const definitionHtml = definition.definition ?? "";
      const gloss = stripHtml(lang === "en" ? englishDefinitionLead(definitionHtml) : definitionHtml);
      const cleaned = lang === "en" ? shortenEnglishGloss(gloss) : gloss;
      if (
        cleaned &&
        (lang !== "en" || cleaned.length > 1) &&
        !glosses.some((g) => g.toLowerCase() === cleaned.toLowerCase())
      ) {
        glosses.push(cleaned);
      }
      const rawExamples =
        definition.parsedExamples ??
        (definition.examples ?? []).map((example) => ({ example }));
      for (const raw of rawExamples) {
        const example = toExample(raw, lang);
        if (example) examples.push(example);
      }
      if (lang === "en" && glosses.length >= 5) break;
    }
    if (glosses.length === 0) continue;
    const sense: DictionarySense = { partOfSpeech: usage.partOfSpeech?.toLowerCase(), glosses };
    if (examples.length) sense.examples = examples.slice(0, lang === "en" ? 2 : 4);
    senses.push(sense);
  }
  if (senses.length === 0) return null;
  return {
    id: `wiktionary:${lang}:${headword}`,
    lang,
    headword,
    senses,
    source: "wiktionary",
  };
}

// ============================================================================
// Fetch + Redis cache
// ============================================================================

async function fetchJson(url: string): Promise<unknown | null> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Remote dictionary ${response.status}`);
  return response.json();
}

type CachedValue<T> = { v: T | null };

async function cached<T>(
  redis: RedisLike | null,
  key: string,
  load: () => Promise<T | null>
): Promise<T | null> {
  if (redis) {
    try {
      const hit = await redis.get<CachedValue<T> | string>(key);
      if (hit) {
        const value = typeof hit === "string" ? (JSON.parse(hit) as CachedValue<T>) : hit;
        return value.v;
      }
    } catch {
      // cache read failures fall through to the network
    }
  }
  const value = await load();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify({ v: value }), {
        ex: value ? REMOTE_CACHE_TTL_SECONDS : REMOTE_MISS_TTL_SECONDS,
      });
    } catch {
      // best effort
    }
  }
  return value;
}

export function dictionaryCacheKey(source: string, lang: string, term: string): string {
  return redisKey("cache", "dictionary", PARSER_CACHE_VERSION, source, lang, term);
}

export async function fetchFreeDictionary(
  word: string,
  redis: RedisLike | null
): Promise<DictionaryEntry | null> {
  return cached(redis, dictionaryCacheKey("free-dictionary", "en", word), async () =>
    parseFreeDictionaryResponse(
      await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
    )
  );
}

export async function fetchDatamuseSynonyms(
  word: string,
  redis: RedisLike | null
): Promise<string[]> {
  const result = await cached(redis, dictionaryCacheKey("datamuse", "en", word), async () =>
    parseDatamuseResponse(
      await fetchJson(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=16`)
    )
  );
  return result ?? [];
}

export async function fetchWiktionary(
  headword: string,
  lang: DictionaryLanguage,
  redis: RedisLike | null
): Promise<DictionaryEntry | null> {
  return cached(redis, dictionaryCacheKey("wiktionary", lang, headword), async () =>
    parseWiktionaryResponse(
      await fetchJson(
        `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(headword)}`
      ),
      lang,
      headword
    )
  );
}
