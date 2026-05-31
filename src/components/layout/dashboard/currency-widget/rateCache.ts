import type { RateCacheEntry } from "./types";

export const rateMemoryCache = new Map<string, RateCacheEntry>();

export function cacheKey(from: string, to: string) {
  return `${from.toUpperCase()}>${to.toUpperCase()}`;
}
