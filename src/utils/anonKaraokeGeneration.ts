/**
 * Free karaoke lyrics generation for signed-out clients.
 *
 * The anonymous identity is a stable id in localStorage
 * (`ryos:karaoke:anon-client-id`). Successfully generated song ids are stored
 * beside it (`ryos:karaoke:anon-generated-songs`) so the allowance survives
 * reloads. The server enforces the same cap against that client id.
 */

export const ANON_KARAOKE_GENERATION_LIMIT = 3;
export const ANON_KARAOKE_CLIENT_ID_KEY = "ryos:karaoke:anon-client-id";
export const ANON_KARAOKE_GENERATED_SONGS_KEY =
  "ryos:karaoke:anon-generated-songs";

const ANON_CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): KeyValueStorage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

let memoryClientId: string | null = null;

function createAnonClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function readAnonGeneratedSongIds(
  storage: Pick<Storage, "getItem"> | null = browserStorage()
): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ANON_KARAOKE_GENERATED_SONGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string" || item.length === 0 || ids.includes(item)) {
        continue;
      }
      ids.push(item);
      if (ids.length >= ANON_KARAOKE_GENERATION_LIMIT) break;
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * Record one successful anonymous generation.
 * The same song does not consume another slot. Returns whether this call
 * is the one that filled the free allowance.
 */
export function recordAnonGeneratedSong(
  songId: string,
  storage: KeyValueStorage | null = browserStorage()
): { count: number; reachedLimit: boolean; recorded: boolean } {
  const ids = readAnonGeneratedSongIds(storage);
  if (!songId || ids.includes(songId)) {
    return {
      count: ids.length,
      reachedLimit: ids.length >= ANON_KARAOKE_GENERATION_LIMIT,
      recorded: false,
    };
  }
  if (ids.length >= ANON_KARAOKE_GENERATION_LIMIT) {
    return {
      count: ids.length,
      reachedLimit: true,
      recorded: false,
    };
  }
  const next = [...ids, songId];
  try {
    storage?.setItem(ANON_KARAOKE_GENERATED_SONGS_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota still reports the in-memory result.
  }
  return {
    count: next.length,
    reachedLimit: next.length >= ANON_KARAOKE_GENERATION_LIMIT,
    recorded: true,
  };
}

/** Stable per-browser id sent with anonymous lyrics-generation requests. */
export function getAnonKaraokeClientId(
  storage: KeyValueStorage | null = browserStorage()
): string {
  if (!storage) {
    memoryClientId ??= createAnonClientId();
    return memoryClientId;
  }
  try {
    const existing = storage.getItem(ANON_KARAOKE_CLIENT_ID_KEY);
    if (existing && ANON_CLIENT_ID_RE.test(existing)) return existing;
  } catch {
    // Fall through and mint an id for this call.
  }
  const id = createAnonClientId();
  try {
    storage.setItem(ANON_KARAOKE_CLIENT_ID_KEY, id);
  } catch {
    // The request can still carry the in-memory id for this page load.
  }
  return id;
}

export function isSignedInForLyrics(auth?: {
  username?: string | null;
  isAuthenticated?: boolean;
} | null): boolean {
  return Boolean(auth?.username && auth.isAuthenticated);
}

/** Attach the anonymous client id. Signed-in requests are left unchanged. */
export function attachAnonKaraokeClient(
  body: Record<string, unknown>,
  auth?: { username?: string | null; isAuthenticated?: boolean } | null
): Record<string, unknown> {
  if (isSignedInForLyrics(auth)) return body;
  return { ...body, anonClientId: getAnonKaraokeClientId() };
}
