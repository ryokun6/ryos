/**
 * Unified auth validation (Edge compatible)
 * 
 * Handles token validation with grace period support.
 * Works in both Edge and Node.js runtimes.
 */

import type { Redis } from "@upstash/redis";
import type { AuthValidationResult } from "./_types.js";
import {
  USER_TTL_SECONDS,
  TOKEN_GRACE_PERIOD,
} from "./_constants.js";
import { getUserTokenKey, getLastTokenKey } from "./_tokens.js";

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

  // 1. Check active token: chat:token:user:{username}:{token}
  const userScopedKey = getUserTokenKey(normalizedUsername, token);
  const exists = await redis.exists(userScopedKey);
  
  if (exists) {
    // Refresh TTL on successful validation
    await redis.expire(userScopedKey, USER_TTL_SECONDS);
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

/**
 * Validate auth and check if user is admin (ryo)
 */
export async function validateAdminAuth(
  redis: Redis,
  username: string | undefined | null,
  token: string | undefined | null
): Promise<AuthValidationResult & { isAdmin: boolean }> {
  const result = await validateAuth(redis, username, token);
  
  if (!result.valid) {
    return { ...result, isAdmin: false };
  }

  const isAdmin = username?.toLowerCase() === "ryo";
  return { ...result, isAdmin };
}

/**
 * Quick check if token exists (no TTL refresh)
 */
export async function tokenExists(
  redis: Redis,
  username: string,
  token: string
): Promise<boolean> {
  const key = getUserTokenKey(username.toLowerCase(), token);
  const exists = await redis.exists(key);
  return exists > 0;
}

