/**
 * Persistent cache for i18n translation bundles (IndexedDB).
 * Speeds repeat visits by avoiding network/chunk fetch before bootstrap completes.
 * Invalidated when the app build stamp changes (deploy).
 */

import type { SupportedLanguage } from "@/lib/languageConfig";
import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";

const LOCALE_CACHE_SCHEMA = 1;

export interface CachedLocaleBundle {
  schema: number;
  language: SupportedLanguage;
  buildStamp: string;
  messages: Record<string, unknown>;
  cachedAt: number;
}

function cacheKey(language: SupportedLanguage, buildStamp: string): string {
  return `${buildStamp}:${language}`;
}

/** Build stamp injected at compile time from public/version.json (prebuild). */
export function getLocaleBuildStamp(): string {
  const stamp = import.meta.env.VITE_BUILD_NUMBER;
  return typeof stamp === "string" && stamp.length > 0 ? stamp : "dev";
}

export async function readCachedLocale(
  language: SupportedLanguage,
  buildStamp: string = getLocaleBuildStamp()
): Promise<Record<string, unknown> | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  let db: IDBDatabase | null = null;
  try {
    db = await ensureIndexedDBInitialized();
    const entry = await new Promise<CachedLocaleBundle | null>((resolve, reject) => {
      const tx = db!.transaction(STORES.LOCALE_TRANSLATIONS, "readonly");
      const req = tx.objectStore(STORES.LOCALE_TRANSLATIONS).get(
        cacheKey(language, buildStamp)
      );
      req.onsuccess = () => {
        const value = req.result as CachedLocaleBundle | undefined;
        if (
          value &&
          value.schema === LOCALE_CACHE_SCHEMA &&
          value.language === language &&
          value.buildStamp === buildStamp &&
          value.messages &&
          typeof value.messages === "object"
        ) {
          resolve(value);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
    return entry?.messages ?? null;
  } catch (error) {
    console.warn("[localeCache] Failed to read cached locale:", error);
    return null;
  } finally {
    if (db) db.close();
  }
}

export async function writeCachedLocale(
  language: SupportedLanguage,
  messages: Record<string, unknown>,
  buildStamp: string = getLocaleBuildStamp()
): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }

  let db: IDBDatabase | null = null;
  try {
    db = await ensureIndexedDBInitialized();
    const payload: CachedLocaleBundle = {
      schema: LOCALE_CACHE_SCHEMA,
      language,
      buildStamp,
      messages,
      cachedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(STORES.LOCALE_TRANSLATIONS, "readwrite");
      const req = tx
        .objectStore(STORES.LOCALE_TRANSLATIONS)
        .put(payload, cacheKey(language, buildStamp));
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.warn("[localeCache] Failed to write cached locale:", error);
  } finally {
    if (db) db.close();
  }
}

/** Drop all cached locale bundles (e.g. after a full cache clear on deploy). */
export async function clearLocaleCache(): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }

  let db: IDBDatabase | null = null;
  try {
    db = await ensureIndexedDBInitialized();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(STORES.LOCALE_TRANSLATIONS, "readwrite");
      const req = tx.objectStore(STORES.LOCALE_TRANSLATIONS).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    console.log("[localeCache] Cleared locale translation cache");
  } catch (error) {
    console.warn("[localeCache] Failed to clear locale cache:", error);
  } finally {
    if (db) db.close();
  }
}
