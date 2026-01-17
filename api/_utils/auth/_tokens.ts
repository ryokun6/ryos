/**
 * Token management utilities (Edge compatible)
 * 
 * Uses Web Crypto API for token generation (works in Edge runtime)
 */

import type { Redis } from "@upstash/redis";
import type { TokenInfo } from "./_types.js";
import {
  AUTH_TOKEN_PREFIX,
  TOKEN_LENGTH,
  USER_TTL_SECONDS,
  USER_EXPIRATION_TIME,
  TOKEN_GRACE_PERIOD,
} from "./_constants.js";

// ============================================================================
// Key Helpers
// ============================================================================

/**
 * Build the Redis key for user-specific tokens
 * Format: chat:token:user:{username}:{token}
 */
export function getUserTokenKey(username: string, token: string): string {
  return `${AUTH_TOKEN_PREFIX}user:${username.toLowerCase()}:${token}`;
}

/**
 * Get pattern for scanning all tokens for a user
 */
export function getUserTokenPattern(username: string): string {
  return `${AUTH_TOKEN_PREFIX}user:${username.toLowerCase()}:*`;
}

/**
 * Build the Redis key for grace-period token storage
 */
export function getLastTokenKey(username: string): string {
  return `${AUTH_TOKEN_PREFIX}last:${username.toLowerCase()}`;
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
  const key = getUserTokenKey(normalizedUsername, token);
  
  await redis.set(key, Date.now(), { ex: USER_EXPIRATION_TIME });
}

/**
 * Delete a single token
 */
export async function deleteToken(
  redis: Redis,
  token: string
): Promise<void> {
  if (!token) return;

  // Find and delete the token key by scanning
  const pattern = `${AUTH_TOKEN_PREFIX}user:*:${token}`;
  let cursor = 0;
  const keysToDelete: string[] = [];

  do {
    const [newCursor, keys] = await redis.scan(cursor, {
      match: pattern,
      count: 100,
    });
    cursor = parseInt(String(newCursor));
    keysToDelete.push(...keys);
  } while (cursor !== 0);

  if (keysToDelete.length > 0) {
    await redis.del(...keysToDelete);
  }
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

  // Delete all active tokens
  const pattern = getUserTokenPattern(normalizedUsername);
  const userTokenKeys: string[] = [];
  let cursor = 0;

  do {
    const [newCursor, foundKeys] = await redis.scan(cursor, {
      match: pattern,
      count: 100,
    });
    cursor = parseInt(String(newCursor));
    userTokenKeys.push(...foundKeys);
  } while (cursor !== 0);

  if (userTokenKeys.length > 0) {
    const deleted = await redis.del(...userTokenKeys);
    deletedCount += deleted;
  }

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
  const pattern = getUserTokenPattern(username);
  const tokens: TokenInfo[] = [];
  let cursor = 0;

  do {
    const [newCursor, keys] = await redis.scan(cursor, {
      match: pattern,
      count: 100,
    });
    cursor = parseInt(String(newCursor));

    for (const key of keys) {
      const parts = key.split(":");
      const token = parts[parts.length - 1];
      const timestamp = await redis.get<number | string>(key);
      tokens.push({ token, createdAt: timestamp });
    }
  } while (cursor !== 0);

  return tokens;
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
  const key = getUserTokenKey(username.toLowerCase(), token);
  await redis.expire(key, USER_TTL_SECONDS);
}
