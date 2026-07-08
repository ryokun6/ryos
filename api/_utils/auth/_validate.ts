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
  getCanonicalSessionKeyFromHash,
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
  // Hash once and reuse — getCanonicalSessionKey used to re-hash the same token.
  const tokenHash = await sha256RedisIdentifier(token);
  const canonicalSessionKey = getCanonicalSessionKeyFromHash(tokenHash);
  const sessionsKey = redisKeys.auth.userSessions(normalizedUsername);

  // Parallel exists + smembers (auto-pipelined on Upstash into one HTTPS RT).
  const [canonicalSessionExists, sessionHashes] = await Promise.all([
    redis.exists(canonicalSessionKey),
    redis.smembers<string[]>(sessionsKey),
  ]);

  if (canonicalSessionExists && sessionHashes.includes(tokenHash)) {
    // Pipeline both TTL refreshes into one round trip.
    const expirePipeline = redis.pipeline();
    expirePipeline.expire(canonicalSessionKey, USER_TTL_SECONDS);
    expirePipeline.expire(sessionsKey, USER_TTL_SECONDS);
    await expirePipeline.exec();
    return { valid: true, expired: false };
  }

  // 2. Check grace period for recently expired tokens (if allowed)
  if (allowExpired) {
    const lastTokenKey = getLastTokenKey(normalizedUsername);
    const lastTokenData = await redis.get<string>(lastTokenKey);

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
