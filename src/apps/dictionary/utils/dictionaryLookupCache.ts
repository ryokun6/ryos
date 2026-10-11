import {
  normalizeDictionaryQuery,
  type DictionaryLookupResponse,
  type DictionaryQueryLanguage,
} from "@/shared/dictionary";

const LOOKUP_CACHE_LIMIT = 80;

const lookups = new Map<string, DictionaryLookupResponse>();

export function dictionaryClientCacheKey(query: string, lang: DictionaryQueryLanguage): string {
  return `${lang}:${normalizeDictionaryQuery(query)}`;
}

export function readDictionaryClientCache(
  query: string,
  lang: DictionaryQueryLanguage
): DictionaryLookupResponse | null {
  const key = dictionaryClientCacheKey(query, lang);
  const hit = lookups.get(key);
  if (!hit) return null;
  lookups.delete(key);
  lookups.set(key, hit);
  return hit;
}

export function writeDictionaryClientCache(
  query: string,
  lang: DictionaryQueryLanguage,
  response: DictionaryLookupResponse
): void {
  const key = dictionaryClientCacheKey(query, lang);
  if (lookups.has(key)) lookups.delete(key);
  lookups.set(key, response);
  while (lookups.size > LOOKUP_CACHE_LIMIT) {
    const oldest = lookups.keys().next().value;
    if (oldest === undefined) break;
    lookups.delete(oldest);
  }
}

export function clearDictionaryClientCache(): void {
  lookups.clear();
}
