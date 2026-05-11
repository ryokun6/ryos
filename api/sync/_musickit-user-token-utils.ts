/**
 * Pure helpers for the `/api/sync/musickit-user-token` endpoint.
 *
 * Kept in a separate `_`-prefixed utility module (so the API route
 * scanner skips it) because the main route file transitively imports
 * `apiHandler` → `_rate-limit.ts`, which calls `createRedis()` at
 * module load and therefore can't be imported into unit tests that
 * run without Redis env vars (e.g. PR CI).
 *
 * The route file imports from here; unit tests import from here too.
 */

/** Maximum allowed length of a Music User Token in characters. */
export const MAX_TOKEN_LENGTH = 4096;

export interface StoredUserToken {
  musicUserToken: string;
  /** Epoch ms — `null` when the client gave no Apple-provided expiry. */
  expiresAt: number | null;
  /** Epoch ms when the row was written. */
  storedAt: number;
}

/**
 * Coerce whatever Redis handed back (string, parsed object, null, …)
 * into a typed {@link StoredUserToken}. Returns `null` for any shape
 * that can't safely be treated as a stored token.
 */
export function parseStoredToken(raw: unknown): StoredUserToken | null {
  if (!raw) return null;
  let candidate: unknown = raw;
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object") return null;
  const obj = candidate as Partial<StoredUserToken>;
  if (typeof obj.musicUserToken !== "string" || obj.musicUserToken.length === 0) {
    return null;
  }
  return {
    musicUserToken: obj.musicUserToken,
    expiresAt:
      typeof obj.expiresAt === "number" && Number.isFinite(obj.expiresAt)
        ? obj.expiresAt
        : null,
    storedAt:
      typeof obj.storedAt === "number" && Number.isFinite(obj.storedAt)
        ? obj.storedAt
        : Date.now(),
  };
}
