/**
 * Cloud-sync + local cache for the Apple Music Music User Token.
 *
 * MusicKit JS normally persists the Music User Token in `localStorage`
 * (and a same-origin cookie on `music.apple.com`). Some embedded
 * browsers — most prominently the Tesla in-car browser — clear all
 * site storage on every page load, which means the user has to
 * re-authorize Apple Music every single time they open the iPod.
 *
 * This module provides two cooperating fallbacks so the iPod can
 * resume the authorized session on reload even when MusicKit JS's own
 * persistence is wiped:
 *
 *   1. **Local IndexedDB cache.** Resilient to localStorage being
 *      cleared (IndexedDB and localStorage are governed by separate
 *      caps in some browsers). Sync-checked first because it's a
 *      synchronous, zero-network round trip.
 *
 *   2. **Cloud-sync account.** When the user is logged into ryOS, the
 *      Music User Token is mirrored to `/api/musickit-user-token`,
 *      scoped to the authenticated user. This survives the entire
 *      origin storage being wiped (Tesla, private-mode-with-no-quota,
 *      a different device entirely), at the cost of one round trip
 *      on iPod open when no local cache is available.
 *
 * Both paths are best-effort: they never throw to the iPod UI, and
 * any failure (offline, unauthenticated, network blip) gracefully
 * degrades to the existing "show the Sign in button" flow.
 */

import { getApiUrl } from "@/utils/platform";

const INDEXEDDB_NAME = "ryOS-musickit";
const INDEXEDDB_VERSION = 1;
const INDEXEDDB_STORE = "user-token";
const INDEXEDDB_KEY = "default";
const ENDPOINT_PATH = "/api/musickit-user-token";

const REQUEST_TIMEOUT_MS = 8000;

export interface CachedMusicKitUserToken {
  /** The Music User Token. */
  musicUserToken: string;
  /**
   * Epoch ms at which the token should be considered expired. May be
   * `null` when the surrounding API gave us no expiry hint — callers
   * should still attempt to use the token and let MusicKit decide.
   */
  expiresAt: number | null;
  /** When this entry was written, epoch ms. */
  storedAt: number;
}

interface CloudTokenResponseSuccess {
  musicUserToken: string;
  expiresAt: number | null;
  storedAt: number;
}

interface CloudTokenResponseEmpty {
  musicUserToken: null;
  reason?: string;
}

type CloudTokenResponse = CloudTokenResponseSuccess | CloudTokenResponseEmpty;

// ---------------------------------------------------------------------------
// IndexedDB helpers (kept private to this module — the public surface only
// returns/accepts the `CachedMusicKitUserToken` shape).
// ---------------------------------------------------------------------------

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
  );
}

function openTokenDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(INDEXEDDB_STORE)) {
        db.createObjectStore(INDEXEDDB_STORE);
      }
    };
  });
}

async function readFromIndexedDb(): Promise<CachedMusicKitUserToken | null> {
  if (!isBrowser()) return null;
  try {
    const db = await openTokenDb();
    return await new Promise<CachedMusicKitUserToken | null>(
      (resolve, reject) => {
        const tx = db.transaction(INDEXEDDB_STORE, "readonly");
        const store = tx.objectStore(INDEXEDDB_STORE);
        const req = store.get(INDEXEDDB_KEY);
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
        req.onsuccess = () => {
          db.close();
          const result = req.result as CachedMusicKitUserToken | undefined;
          if (!result || typeof result.musicUserToken !== "string") {
            resolve(null);
            return;
          }
          resolve({
            musicUserToken: result.musicUserToken,
            expiresAt:
              typeof result.expiresAt === "number" ? result.expiresAt : null,
            storedAt:
              typeof result.storedAt === "number" ? result.storedAt : Date.now(),
          });
        };
      }
    );
  } catch (err) {
    console.warn("[musickit cloud sync] indexeddb read failed", err);
    return null;
  }
}

async function writeToIndexedDb(value: CachedMusicKitUserToken): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await openTokenDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(INDEXEDDB_STORE, "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.objectStore(INDEXEDDB_STORE).put(value, INDEXEDDB_KEY);
    });
  } catch (err) {
    console.warn("[musickit cloud sync] indexeddb write failed", err);
  }
}

async function deleteFromIndexedDb(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await openTokenDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(INDEXEDDB_STORE, "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.objectStore(INDEXEDDB_STORE).delete(INDEXEDDB_KEY);
    });
  } catch (err) {
    console.warn("[musickit cloud sync] indexeddb delete failed", err);
  }
}

// ---------------------------------------------------------------------------
// Cloud helpers
// ---------------------------------------------------------------------------

function endpointUrl(): string {
  return getApiUrl(ENDPOINT_PATH);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException("Timeout", "TimeoutError")),
    REQUEST_TIMEOUT_MS
  );
  try {
    return await fetch(url, {
      ...init,
      // Same-origin works for both deployed Vercel (frontend + API on the
      // same origin) and the local dev proxy which forwards /api/* to the
      // standalone Bun server.
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      console.warn("[musickit cloud sync] request aborted (timeout)");
    } else {
      console.warn("[musickit cloud sync] request failed", err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch the Music User Token saved in the user's ryOS account.
 * Returns `null` when:
 *   - the user is not authenticated (401)
 *   - the server has no token stored for them
 *   - the saved token has expired
 *   - the network call fails
 *
 * NEVER throws — designed to be safe to call on every iPod open.
 */
export async function fetchMusicKitUserTokenFromCloud(): Promise<CachedMusicKitUserToken | null> {
  if (!isBrowser()) return null;
  const response = await fetchWithTimeout(endpointUrl(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response) return null;
  if (response.status === 401 || response.status === 403) {
    // Not signed in — nothing to fetch, and this is the normal case for
    // anonymous users. Don't log noise.
    return null;
  }
  if (!response.ok) {
    console.warn(
      `[musickit cloud sync] GET returned ${response.status}`
    );
    return null;
  }
  let data: CloudTokenResponse | null = null;
  try {
    data = (await response.json()) as CloudTokenResponse;
  } catch (err) {
    console.warn("[musickit cloud sync] GET parse failed", err);
    return null;
  }
  if (!data || !("musicUserToken" in data) || !data.musicUserToken) {
    return null;
  }
  const success = data as CloudTokenResponseSuccess;
  return {
    musicUserToken: success.musicUserToken,
    expiresAt:
      typeof success.expiresAt === "number" ? success.expiresAt : null,
    storedAt:
      typeof success.storedAt === "number" ? success.storedAt : Date.now(),
  };
}

/**
 * Save the Music User Token to the user's ryOS account. Safe to call
 * for anonymous users — the server will respond 401 and we'll silently
 * swallow it (the IndexedDB write still happens, so anonymous sessions
 * still benefit from the local-cache fallback).
 */
export async function saveMusicKitUserTokenToCloud(
  value: CachedMusicKitUserToken
): Promise<void> {
  if (!isBrowser()) return;
  const response = await fetchWithTimeout(endpointUrl(), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      musicUserToken: value.musicUserToken,
      expiresAt: value.expiresAt ?? null,
    }),
  });
  if (!response) return;
  if (response.status === 401 || response.status === 403) return;
  if (!response.ok) {
    console.warn(
      `[musickit cloud sync] PUT returned ${response.status}`
    );
  }
}

/**
 * Clear the Music User Token saved in the user's ryOS account. Best
 * effort — called from `unauthorize()` and on ryOS sign-out so a
 * different ryOS user signing in on the same device doesn't inherit
 * the previous user's Apple Music session.
 */
export async function clearMusicKitUserTokenInCloud(): Promise<void> {
  if (!isBrowser()) return;
  const response = await fetchWithTimeout(endpointUrl(), {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!response) return;
  if (response.status === 401 || response.status === 403) return;
  if (!response.ok) {
    console.warn(
      `[musickit cloud sync] DELETE returned ${response.status}`
    );
  }
}

// ---------------------------------------------------------------------------
// Public load/save/clear surface — combines IndexedDB + cloud.
// ---------------------------------------------------------------------------

/**
 * Try to recover a previously-authorized Music User Token, preferring
 * the fastest source. The IndexedDB cache is consulted first because
 * it's a sync, zero-network round trip; if absent, the cloud-sync
 * account is consulted (assuming the user is signed in). On a
 * successful cloud read, the result is mirrored back into IndexedDB
 * so subsequent loads are instant.
 */
export async function loadCachedMusicKitUserToken(): Promise<CachedMusicKitUserToken | null> {
  const local = await readFromIndexedDb();
  if (local && !isExpired(local)) {
    return local;
  }

  const cloud = await fetchMusicKitUserTokenFromCloud();
  if (cloud) {
    // Mirror back to local so the next reload doesn't need a round trip
    // — even on Tesla, where the next reload would re-hit cloud anyway
    // if IndexedDB gets wiped, this is harmless.
    void writeToIndexedDb(cloud);
    return cloud;
  }

  // If we had a stale local entry but no cloud copy, treat it as gone
  // — we intentionally don't return expired tokens.
  if (local && isExpired(local)) {
    void deleteFromIndexedDb();
  }
  return null;
}

/**
 * Mirror a fresh Music User Token into IndexedDB and the cloud.
 * Returns a promise that resolves once both writes have settled —
 * callers may safely fire-and-forget, the function never throws.
 */
export async function persistMusicKitUserToken(
  value: CachedMusicKitUserToken
): Promise<void> {
  await Promise.allSettled([
    writeToIndexedDb(value),
    saveMusicKitUserTokenToCloud(value),
  ]);
}

/**
 * Remove the Music User Token from both IndexedDB and the cloud.
 * Called from MusicKit's `unauthorize()` and ryOS sign-out.
 */
export async function clearCachedMusicKitUserToken(): Promise<void> {
  await Promise.allSettled([
    deleteFromIndexedDb(),
    clearMusicKitUserTokenInCloud(),
  ]);
}

/**
 * Predicate exposed for tests; tokens with a non-null `expiresAt` in
 * the past are considered unusable. A `null` `expiresAt` is treated as
 * "unknown" and never marked expired here — MusicKit itself will
 * refuse the token if it's actually dead and trigger a re-authorize.
 */
export function isExpired(value: CachedMusicKitUserToken): boolean {
  if (value.expiresAt == null) return false;
  return value.expiresAt <= Date.now();
}
