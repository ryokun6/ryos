/**
 * Unified auth validation (Edge compatible)
 * 
 * Handles token validation with grace period support.
 * Works in both Edge and Node.js runtimes.
 */

import type { Redis } from "../redis.js";
import type { AuthValidationResult } from "./_types.js";
import {
  USER_TTL_SECONDS,
  TOKEN_GRACE_PERIOD,
} from "./_constants.js";
import {
  getCanonicalSessionKey,
  getLegacyLastTokenKey,
  getUserTokenKey,
  getLastTokenKey,
} from "./_tokens.js";
import { redisKeys, sha256RedisIdentifier } from "../../../src/shared/redisKeys.js";

// ============================================================================
// Validation Options
// ============================================================================

export interface ValidateAuthOptions {
  /** Allow tokens within grace period (default: false) */
  allowExpired?: boolean;
  /** Auto-refresh token on grace period match (default: false) */
  refreshOnGrace?: boolean;
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate an authentication token
 * 
 * @param redis - Redis client
 * @param username - Username to validate
 * @param token - Token to validate
 * @param options - Validation options
 * @returns Validation result with valid flag and optional expired indicator
 */
export async function validateAuth(
  redis: Redis,
  username: string | undefined | null,
  token: string | undefined | null,
  options: ValidateAuthOptions = {}
): Promise<AuthValidationResult> {
  const { allowExpired = false } = options;

  // Must have both username and token
  if (!username || !token) {
    return { valid: false };
  }

  const normalizedUsername = username.toLowerCase();

  // 1. Check canonical active token:
  // auth:session:{sha256(token)} + auth:user:{username}:sessions membership.
  const tokenHash = await sha256RedisIdentifier(token);
  const canonicalSessionKey = await getCanonicalSessionKey(token);
  const canonicalSessionExists = await redis.exists(canonicalSessionKey);
  if (canonicalSessionExists) {
    const sessionHashes = await redis.smembers<string[]>(
      redisKeys.auth.userSessions(normalizedUsername)
    );
    if (sessionHashes.includes(tokenHash)) {
      await redis.expire(canonicalSessionKey, USER_TTL_SECONDS);
      await redis.expire(redisKeys.auth.userSessions(normalizedUsername), USER_TTL_SECONDS);
      return { valid: true, expired: false };
    }
  }

  // 2. Check legacy active token: chat:token:user:{username}:{token}
  const userScopedKey = getUserTokenKey(normalizedUsername, token);
  const exists = await redis.exists(userScopedKey);
  
  if (exists) {
    await redis.set(canonicalSessionKey, Date.now(), { ex: USER_TTL_SECONDS });
    await redis.sadd(redisKeys.auth.userSessions(normalizedUsername), tokenHash);
    await redis.expire(redisKeys.auth.userSessions(normalizedUsername), USER_TTL_SECONDS);
    return { valid: true, expired: false };
  }

  // 3. Check grace period for recently expired tokens (if allowed)
  if (allowExpired) {
    const lastTokenKey = getLastTokenKey(normalizedUsername);
    const lastTokenData =
      (await redis.get<string>(lastTokenKey)) ??
      (await redis.get<string>(getLegacyLastTokenKey(normalizedUsername)));

    if (lastTokenData) {
      try {
        const parsed =
          typeof lastTokenData === "string"
            ? JSON.parse(lastTokenData)
            : lastTokenData;
        
        const { token: lastToken, expiredAt } = parsed;
        const gracePeriodEnd = expiredAt + TOKEN_GRACE_PERIOD * 1000;

        if (lastToken === token && Date.now() < gracePeriodEnd) {
          // Token is within grace period
          return { valid: true, expired: true };
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
  }

  return { valid: false };
}

/**
 * Quick check if token exists (no TTL refresh)
 */
export async function tokenExists(
  redis: Redis,
  username: string,
  token: string
): Promise<boolean> {
  const tokenHash = await sha256RedisIdentifier(token);
  if (await redis.exists(redisKeys.auth.session(tokenHash))) {
    const sessionHashes = await redis.smembers<string[]>(
      redisKeys.auth.userSessions(username.toLowerCase())
    );
    if (sessionHashes.includes(tokenHash)) return true;
  }
  const key = getUserTokenKey(username.toLowerCase(), token);
  const exists = await redis.exists(key);
  return exists > 0;
}

