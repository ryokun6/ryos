/**
 * String hashing utilities for cache key generation
 */

/**
 * djb2 hash function - converts string to hex hash
 * Used for generating stable cache keys
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Build a cache key with a prefix and hashed content
 */
export function buildCacheKey(prefix: string, ...parts: string[]): string {
  const normalized = parts.map((p) => p.trim().toLowerCase()).filter(Boolean).join("|");
  return `${prefix}${hashString(normalized)}`;
}
