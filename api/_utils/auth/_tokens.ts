/**
 * Token management utilities (Edge compatible)
 * 
 * Uses Web Crypto API for token generation (works in Edge runtime)
 */

import type { Redis } from "../redis.js";
import type { TokenInfo } from "./_types.js";
import {
  TOKEN_LENGTH,
  USER_TTL_SECONDS,
  USER_EXPIRATION_TIME,
  TOKEN_GRACE_PERIOD,
} from "./_constants.js";
import { redisKeys, sha256RedisIdentifier } from "../../../src/shared/redisKeys.js";

// ============================================================================
// Key Helpers
// ============================================================================

export async function getCanonicalSessionKey(token: string): Promise<string> {
  return redisKeys.auth.session(await sha256RedisIdentifier(token));
}

/**
 * Build the Redis key for grace-period token storage
 */
export function getLastTokenKey(username: string): string {
  return redisKeys.auth.lastSession(username);
}

// ============================================================================
// Token Generation (Edge compatible)
// ============================================================================

/**
 * Generate a secure authentication token using Web Crypto API
 * Works in both Edge and Node.js runtimes
 */
export function generateAuthToken(): string {
  const tokenBytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(tokenBytes);
  return Array.from(tokenBytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

// ============================================================================
// Token CRUD Operations
// ============================================================================

/**
 * Store a token for a user
 */
export async function storeToken(
  redis: Redis,
  username: string,
  token: string
): Promise<void> {
  if (!token) return;
  
  const normalizedUsername = username.toLowerCase();
  const tokenHash = await sha256RedisIdentifier(token);
  const key = redisKeys.auth.session(tokenHash);
  
  await redis.set(key, Date.now(), { ex: USER_EXPIRATION_TIME });
  await redis.sadd(redisKeys.auth.userSessions(normalizedUsername), tokenHash);
  await redis.expire(redisKeys.auth.userSessions(normalizedUsername), USER_EXPIRATION_TIME);
}

/**
 * Delete a single token.
 *
 * When the owning `username` is known (the common case — logout, refresh,
 * login rotation), the token hash is removed from that user's session set
 * directly. Without it, we fall back to a full keyspace SCAN of
 * `auth:user:*:sessions`, which is O(all users) and should be avoided.
 */
export async function deleteToken(
  redis: Redis,
  token: string,
  username?: string
): Promise<void> {
  if (!token) return;
  const tokenHash = await sha256RedisIdentifier(token);
  await redis.del(redisKeys.auth.session(tokenHash));

  const normalizedUsername = username?.toLowerCase();
  if (normalizedUsername) {
    await redis.srem(
      redisKeys.auth.userSessions(normalizedUsername),
      tokenHash
    );
    return;
  }

  // Fallback: owner unknown — scan all user session sets. Kept for safety,
  // but callers should pass `username` to avoid the full keyspace scan.
  let canonicalCursor = 0;
  do {
    const [newCursor, foundKeys] = await redis.scan(canonicalCursor, {
      match: "auth:user:*:sessions",
      count: 100,
    });
    canonicalCursor = parseInt(String(newCursor));
    for (const key of foundKeys) {
      await redis.srem(key, tokenHash);
    }
  } while (canonicalCursor !== 0);
}

/**
 * Delete all tokens for a user
 */
export async function deleteAllUserTokens(
  redis: Redis,
  username: string
): Promise<number> {
  const normalizedUsername = username.toLowerCase();
  let deletedCount = 0;

  const canonicalSessionSetKey = redisKeys.auth.userSessions(normalizedUsername);
  const tokenHashes = await redis.smembers<string[]>(canonicalSessionSetKey);
  if (tokenHashes.length > 0) {
    deletedCount += await redis.del(
      ...tokenHashes.map((tokenHash) => redisKeys.auth.session(tokenHash))
    );
  }
  deletedCount += await redis.del(canonicalSessionSetKey);

  // Delete grace-period token
  const lastTokenKey = getLastTokenKey(normalizedUsername);
  const lastDeleted = await redis.del(lastTokenKey);
  deletedCount += lastDeleted;

  return deletedCount;
}

/**
 * Get all active tokens for a user
 */
export async function getUserTokens(
  redis: Redis,
  username: string
): Promise<TokenInfo[]> {
  const normalizedUsername = username.toLowerCase();
  const tokenHashes = await redis.smembers<string[]>(redisKeys.auth.userSessions(normalizedUsername));
  const canonicalTokens = await Promise.all(
    tokenHashes.map(async (tokenHash) => ({
      token: tokenHash,
      createdAt: await redis.get<number | string>(redisKeys.auth.session(tokenHash)),
    }))
  );

  return canonicalTokens;
}

/**
 * Store a last-token record for grace-period refreshes
 */
export async function storeLastValidToken(
  redis: Redis,
  username: string,
  token: string,
  expiredAtMs: number = Date.now(),
  ttlSeconds: number = TOKEN_GRACE_PERIOD
): Promise<void> {
  const lastTokenKey = getLastTokenKey(username.toLowerCase());
  const tokenData = {
    token,
    expiredAt: expiredAtMs,
  };
  await redis.set(lastTokenKey, JSON.stringify(tokenData), { ex: ttlSeconds });
}

/**
 * Refresh token TTL (called on successful validation)
 */
export async function refreshTokenTTL(
  redis: Redis,
  username: string,
  token: string
): Promise<void> {
  const normalizedUsername = username.toLowerCase();
  const tokenHash = await sha256RedisIdentifier(token);
  await redis.expire(redisKeys.auth.session(tokenHash), USER_TTL_SECONDS);
  await redis.expire(redisKeys.auth.userSessions(normalizedUsername), USER_TTL_SECONDS);
}
