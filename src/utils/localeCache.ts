/**
 * Persist parsed i18n bundles for the active language between sessions.
 *
 * Why localStorage (not IndexedDB):
 * - One cached language is ~150–200 KB; well under typical 5 MB quotas.
 * - Avoids opening the ryOS IndexedDB database on the critical bootstrap path.
 * - Locale *chunks* are still cached by the service worker (CacheFirst on /assets/*.js);
 *   this layer skips re-downloading and re-parsing the Vite locale module on repeat visits.
 *
 * Why not only the service worker:
 * - SW caches the JS chunk; boot still must fetch + evaluate the module. Storing parsed JSON
 *   lets `addResourceBundle` run without a dynamic import when the build stamp matches.
 */

import type { SupportedLanguage } from "@/lib/languageConfig";

const STORAGE_PREFIX = "ryos:locale:";
const LOCALE_CACHE_SCHEMA = 1;

interface CachedLocaleBundle {
  schema: number;
  language: SupportedLanguage;
  buildStamp: string;
  messages: Record<string, unknown>;
  cachedAt: number;
}

function storageKey(language: SupportedLanguage, buildStamp: string): string {
  return `${STORAGE_PREFIX}${LOCALE_CACHE_SCHEMA}:${buildStamp}:${language}`;
}

function isStorageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

/** Build stamp injected at compile time from public/version.json (prebuild). */
export function getLocaleBuildStamp(): string {
  const stamp = import.meta.env.VITE_BUILD_NUMBER;
  return typeof stamp === "string" && stamp.length > 0 ? stamp : "dev";
}

function parseCachedBundle(
  raw: string,
  language: SupportedLanguage,
  buildStamp: string
): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw) as CachedLocaleBundle;
    if (
      value?.schema === LOCALE_CACHE_SCHEMA &&
      value.language === language &&
      value.buildStamp === buildStamp &&
      value.messages &&
      typeof value.messages === "object"
    ) {
      return value.messages;
    }
  } catch {
    // corrupt entry
  }
  return null;
}

/** Drop cached bundles from other deploys to free quota. */
function pruneOtherBuildStamps(keepBuildStamp: string): void {
  if (!isStorageAvailable()) return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    if (!key.includes(`:${keepBuildStamp}:`)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

export async function readCachedLocale(
  language: SupportedLanguage,
  buildStamp: string = getLocaleBuildStamp()
): Promise<Record<string, unknown> | null> {
  if (!isStorageAvailable()) return null;

  try {
    const raw = localStorage.getItem(storageKey(language, buildStamp));
    if (!raw) return null;
    return parseCachedBundle(raw, language, buildStamp);
  } catch (error) {
    console.warn("[localeCache] Failed to read cached locale:", error);
    return null;
  }
}

export async function writeCachedLocale(
  language: SupportedLanguage,
  messages: Record<string, unknown>,
  buildStamp: string = getLocaleBuildStamp()
): Promise<void> {
  if (!isStorageAvailable()) return;

  try {
    const payload: CachedLocaleBundle = {
      schema: LOCALE_CACHE_SCHEMA,
      language,
      buildStamp,
      messages,
      cachedAt: Date.now(),
    };
    localStorage.setItem(storageKey(language, buildStamp), JSON.stringify(payload));
    pruneOtherBuildStamps(buildStamp);
  } catch (error) {
    console.warn("[localeCache] Failed to write cached locale:", error);
  }
}

/** Drop all cached locale bundles (e.g. after a full cache clear on deploy). */
export async function clearLocaleCache(): Promise<void> {
  if (!isStorageAvailable()) return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    console.log("[localeCache] Cleared locale translation cache");
  } catch (error) {
    console.warn("[localeCache] Failed to clear locale cache:", error);
  }
}
