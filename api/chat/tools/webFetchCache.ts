/**
 * Short-lived extract cache so a later webFetch page does not download again.
 * Bounded by entry count, total characters, and a few minutes.
 */

import {
  WEB_FETCH_CACHE_MAX_CHARS,
  WEB_FETCH_CACHE_MAX_ENTRIES,
  WEB_FETCH_CACHE_TTL_MS,
} from "./webContentLimits.js";
import type { PageableWebDocument } from "./webFetchPage.js";

export interface CachedWebFetch extends PageableWebDocument {
  finalUrl: string;
  title?: string;
  description?: string;
  siteName?: string;
}

interface CacheEntry {
  expiresAt: number;
  chars: number;
  doc: CachedWebFetch;
}

const store = new Map<string, CacheEntry>();
let totalChars = 0;

function cacheKey(url: string, selector: string | undefined): string {
  return `${url.trim()}\u0000${selector?.trim() ?? ""}`;
}

function drop(key: string): void {
  const entry = store.get(key);
  if (!entry) return;
  store.delete(key);
  totalChars -= entry.chars;
}

function evictFor(extra: number): void {
  while (
    store.size >= WEB_FETCH_CACHE_MAX_ENTRIES ||
    (store.size > 0 && totalChars + extra > WEB_FETCH_CACHE_MAX_CHARS)
  ) {
    const oldest = store.keys().next().value;
    if (!oldest) break;
    drop(oldest);
  }
}

export function readWebFetchCache(
  url: string,
  selector: string | undefined,
  now = Date.now()
): CachedWebFetch | undefined {
  const key = cacheKey(url, selector);
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    drop(key);
    return undefined;
  }
  store.delete(key);
  store.set(key, entry);
  return entry.doc;
}

export function writeWebFetchCache(
  url: string,
  selector: string | undefined,
  doc: CachedWebFetch,
  now = Date.now()
): void {
  const chars = doc.text.length;
  if (chars > WEB_FETCH_CACHE_MAX_CHARS) return;
  const key = cacheKey(url, selector);
  drop(key);
  evictFor(chars);
  if (chars > WEB_FETCH_CACHE_MAX_CHARS) return;
  store.set(key, { expiresAt: now + WEB_FETCH_CACHE_TTL_MS, chars, doc });
  totalChars += chars;
}

export function clearWebFetchCache(): void {
  store.clear();
  totalChars = 0;
}
