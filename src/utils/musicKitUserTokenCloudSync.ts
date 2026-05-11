/**
 * Cloud-sync + local cache for the Apple Music **Music User Token**.
 *
 * MusicKit JS normally persists the Music User Token in `localStorage`
 * (and a same-origin cookie on `music.apple.com`). Some embedded
 * browsers — most prominently the Tesla in-car browser — clear all
 * site storage on every page load, which means the user has to
 * re-authorize Apple Music every single time they open the iPod.
 *
 * This module provides two cooperating fallbacks so the iPod can
 * resume the authorized session on reload (and across devices) even
 * when MusicKit JS's own persistence is wiped:
 *
 *   1. **Local IndexedDB cache.** Always used, regardless of cloud
 *      sync state — resilient to `localStorage` being cleared without
 *      a network round trip. Cleared on every ryOS sign-out so the
 *      next ryOS user on the device starts fresh.
 *
 *   2. **The user's ryOS cloud-sync account.** Mirrors the token
 *      under `/api/sync/musickit-user-token` so it survives the
 *      entire origin storage being wiped (Tesla, a fresh device, a
 *      sign-out + sign-in cycle on the same browser). The token is
 *      **bound to the ryOS account**, not the device — we
 *      intentionally do NOT delete the cloud copy on ryOS sign-out.
 *      Only the explicit Apple Music `unauthorize()` flow clears the
 *      cloud copy. Cloud reads / writes are gated on
 *      `useCloudSyncStore.autoSyncEnabled`, mirroring the other
 *      `/api/sync/*` clients in this codebase.
 *
 * Every public function is best-effort: a network failure, a 401, a
 * disabled `autoSyncEnabled`, or a missing IndexedDB never throws to
 * the iPod UI. Failures gracefully degrade to the existing
 * "Sign in" flow.
 */

import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { subscribeToCloudSyncCheckRequests } from "@/utils/cloudSyncEvents";

const INDEXEDDB_NAME = "ryOS-musickit";
const INDEXEDDB_VERSION = 1;
const INDEXEDDB_STORE = "user-token";
const INDEXEDDB_KEY = "default";

const ENDPOINT_PATH = "/api/sync/musickit-user-token";
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

/**
 * The IndexedDB helpers are guarded separately from the cloud
 * helpers: IndexedDB only exists in a real browser, but `fetch` is
 * universal in modern Bun / Node / SSR runtimes, so the cloud-side
 * guards only check for those environments. This keeps the cloud
 * sync layer testable without a `fake-indexeddb` dependency.
 */
function hasIndexedDb(): boolean {
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
  if (!hasIndexedDb()) return null;
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
  if (!hasIndexedDb()) return;
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
  if (!hasIndexedDb()) return;
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
// Gating: cloud reads / writes only happen when (1) the user is signed in
// to ryOS and (2) they have Auto Sync turned on. This matches every other
// `/api/sync/*` client in this codebase (`autoSyncPreference`,
// `useAutoCloudSync`, etc.) — Auto Sync is the single user-facing switch
// that gates cross-device propagation of their state.
// ---------------------------------------------------------------------------

function isCloudSyncActive(): boolean {
  const chats = useChatsStore.getState();
  if (!chats.isAuthenticated || !chats.username) return false;
  const sync = useCloudSyncStore.getState();
  return sync.autoSyncEnabled === true;
}

function endpointUrl(): string {
  return getApiUrl(ENDPOINT_PATH);
}

async function safeFetch(init: RequestInit): Promise<Response | null> {
  try {
    // `credentials: "include"` matches the other /api/sync/* callers and
    // keeps the auth cookie flowing through dev proxies + cross-origin
    // production setups.
    return await abortableFetch(endpointUrl(), {
      ...init,
      credentials: "include",
      timeout: REQUEST_TIMEOUT_MS,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    });
  } catch (err) {
    console.warn("[musickit cloud sync] request failed", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cloud helpers — caller-driven, all guarded by `isCloudSyncActive()`. The
// `force` overload bypasses the gate for the unauthorize() path so a user
// can revoke the cloud copy even when Auto Sync is off.
// ---------------------------------------------------------------------------

/**
 * Fetch the Music User Token saved in the user's ryOS account.
 * Returns `null` when:
 *   - Auto Sync is off / user not signed in to ryOS
 *   - the user has no saved token (404-style empty response)
 *   - the saved token has expired
 *   - the network call fails
 *
 * NEVER throws — designed to be safe to call on every iPod open.
 */
export async function fetchMusicKitUserTokenFromCloud(): Promise<CachedMusicKitUserToken | null> {
  if (typeof fetch === "undefined") return null;
  if (!isCloudSyncActive()) return null;

  const response = await safeFetch({
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response) return null;
  if (response.status === 401 || response.status === 403) {
    // Auth state went stale mid-request. Silently bail.
    return null;
  }
  if (!response.ok) {
    console.warn(`[musickit cloud sync] GET returned ${response.status}`);
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
 * Save the Music User Token to the user's ryOS account. Gated on
 * `isCloudSyncActive()` — no-ops silently when Auto Sync is off or
 * the user isn't signed in to ryOS. Local IDB caching is handled
 * separately by {@link persistMusicKitUserToken}.
 */
export async function saveMusicKitUserTokenToCloud(
  value: CachedMusicKitUserToken
): Promise<void> {
  if (typeof fetch === "undefined") return;
  if (!isCloudSyncActive()) return;

  const response = await safeFetch({
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
    console.warn(`[musickit cloud sync] PUT returned ${response.status}`);
  }
}

/**
 * Clear the Music User Token saved in the user's ryOS account.
 *
 * Bypasses the Auto Sync gate — this is called from Apple Music
 * `unauthorize()` and the stale-token recovery path, where the user
 * has actively asked us to revoke (or Apple has rejected) the token.
 * The ryOS-sign-out path uses
 * {@link clearLocalMusicKitUserTokenCache} instead, because the cloud
 * copy is bound to the account and meant to survive sign-out cycles.
 *
 * **Compare-and-swap behavior.** When `ifMusicUserToken` is provided,
 * the server only deletes when the currently-stored cloud value
 * matches — so a stale-token cleanup running on one device cannot
 * clobber a fresh token that another device already wrote. Returns
 * `true` when the deletion happened, `false` when the server
 * preserved a different (newer) token, and `null` when the request
 * never made it out (offline, unauthenticated, etc).
 */
export async function clearMusicKitUserTokenInCloud(
  ifMusicUserToken?: string | null
): Promise<boolean | null> {
  if (typeof fetch === "undefined") return null;
  const chats = useChatsStore.getState();
  // Skip the network call when there's no way to authenticate it — but
  // unlike fetch/save, we don't gate on `autoSyncEnabled`: an
  // unauthorize() that happened while Auto Sync was off should still
  // wipe a previously-mirrored cloud copy if the user is signed in.
  if (!chats.isAuthenticated || !chats.username) return null;

  const init: RequestInit = {
    method: "DELETE",
    headers: { Accept: "application/json" },
  };
  if (ifMusicUserToken) {
    init.headers = {
      ...(init.headers as Record<string, string>),
      "Content-Type": "application/json",
    };
    init.body = JSON.stringify({ ifMusicUserToken });
  }

  const response = await safeFetch(init);
  if (!response) return null;
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    console.warn(`[musickit cloud sync] DELETE returned ${response.status}`);
    return null;
  }
  try {
    const data = (await response.json()) as { deleted?: boolean };
    return data.deleted === true;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public load/save/clear surface — combines IndexedDB + cloud.
// ---------------------------------------------------------------------------

/**
 * Try to recover a previously-authorized Music User Token, preferring
 * the fastest source. The local IndexedDB cache is consulted first
 * because it's a sync, zero-network round trip; if absent (or stale)
 * and cloud sync is active, the user's ryOS account is consulted.
 * Successful cloud reads are mirrored back into IndexedDB so
 * subsequent reloads are instant.
 */
export async function loadCachedMusicKitUserToken(): Promise<CachedMusicKitUserToken | null> {
  const local = await readFromIndexedDb();
  if (local && !isExpired(local)) {
    return local;
  }

  const cloud = await fetchMusicKitUserTokenFromCloud();
  if (cloud) {
    void writeToIndexedDb(cloud);
    return cloud;
  }

  if (local && isExpired(local)) {
    void deleteFromIndexedDb();
  }
  return null;
}

/**
 * Mirror a fresh Music User Token into IndexedDB and (when cloud sync
 * is active) the cloud. Returns a promise that resolves once both
 * writes have settled — callers may safely fire-and-forget, the
 * function never throws.
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
 * Wipe the IndexedDB cache only. Used by the ryOS sign-out path so
 * the next ryOS user on this device doesn't start a session with a
 * locally-cached token; the cloud copy is preserved so signing back
 * in restores the Apple Music auth automatically.
 */
export async function clearLocalMusicKitUserTokenCache(): Promise<void> {
  await deleteFromIndexedDb();
}

/**
 * Wipe both the IndexedDB cache and the cloud copy. Used by the
 * explicit Apple Music `unauthorize()` flow and the stale-token
 * recovery path.
 *
 * `ifMusicUserToken` (optional) requests **compare-and-swap** behavior
 * on cloud: the cloud row is deleted only when the currently-stored
 * value matches. This is the safe default for multi-device
 * scenarios, where another device may have written a fresh token to
 * cloud while this device's session went stale. Pass `null` /
 * `undefined` to do an unconditional cloud delete (rarely needed).
 */
export async function clearCachedMusicKitUserToken(
  ifMusicUserToken?: string | null
): Promise<void> {
  await Promise.allSettled([
    deleteFromIndexedDb(),
    clearMusicKitUserTokenInCloud(ifMusicUserToken ?? null),
  ]);
}

/**
 * Stale-token recovery: when MusicKit reports that a previously-
 * loaded token has been rejected by Apple
 * (`authorizationStatusDidChange` flipping `isAuthorized` to false
 * after we'd cached a token), wipe local IDB unconditionally and
 * CAS-clear the cloud copy with the now-known-dead token.
 *
 * The CAS guard is what protects multi-device users: if a phone
 * detects a dead token but a laptop has just written a fresh one,
 * the phone's cleanup leaves the laptop's session intact in cloud.
 *
 * Always wipes the local cache regardless of cloud state, so the
 * next reload on this device doesn't loop on the dead token.
 */
export async function clearMusicKitUserTokenIfStale(
  staleToken: string
): Promise<void> {
  await Promise.allSettled([
    deleteFromIndexedDb(),
    clearMusicKitUserTokenInCloud(staleToken),
  ]);
}

// ---------------------------------------------------------------------------
// Cloud-sync trigger plumbing
//
// The `cloudSyncEvents` bus already fires on every "sync now" /
// post-login / visibility-driven check via `requestCloudSyncCheck()`.
// Subscribing here means the Music User Token rides along with the
// existing sync cadence — the iPod doesn't need to spin up its own
// timer, and the user's "Sync now" button works for this state too.
//
// `subscribeToMusicKitUserTokenAutoSync` is idempotent and returns an
// unsubscribe function. It's wired up at app startup (alongside
// `useAutoCloudSync`) so the subscription lifetime tracks the app
// itself rather than any individual iPod window.
// ---------------------------------------------------------------------------

let activeSubscription: (() => void) | null = null;

/**
 * Subscribe to global cloud-sync check requests and refresh the local
 * Music User Token cache from cloud when one fires. Returns an
 * unsubscribe function. Calling twice in a row is a no-op — the
 * second call returns a no-op unsubscriber so the caller can still
 * release deterministically.
 */
export function subscribeToMusicKitUserTokenAutoSync(): () => void {
  if (activeSubscription) {
    return () => {
      /* already-subscribed; primary subscriber owns lifecycle */
    };
  }

  const unsubscribe = subscribeToCloudSyncCheckRequests(() => {
    if (!isCloudSyncActive()) return;
    void (async () => {
      const cloud = await fetchMusicKitUserTokenFromCloud();
      if (cloud) {
        await writeToIndexedDb(cloud);
        return;
      }
      // Nothing in cloud — promote whatever we have locally so other
      // devices (or this same device after a wipe) can pick it up
      // next time. Skipping the upload silently when the local cache
      // is also empty.
      const local = await readFromIndexedDb();
      if (local && !isExpired(local)) {
        await saveMusicKitUserTokenToCloud(local);
      }
    })();
  });

  activeSubscription = () => {
    unsubscribe();
    activeSubscription = null;
  };
  return activeSubscription;
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
