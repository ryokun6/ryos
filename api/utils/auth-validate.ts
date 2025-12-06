/**
 * Edge-compatible authentication validation utilities
 * This module can be imported by both Node.js and Edge runtime API endpoints
 */

// TTL constants (must match constants.ts)
export const USER_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
export const TOKEN_GRACE_PERIOD = 30 * 24 * 60 * 60; // 30 days

export interface AuthValidationResult {
  valid: boolean;
  expired?: boolean;
  newToken?: string;
}

interface RedisLike {
  exists(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ex?: number }): Promise<unknown>;
}

/**
 * Build the Redis key for user-specific tokens
 */
export function getUserTokenKey(username: string, token: string): string {
  return `chat:token:user:${username.toLowerCase()}:${token}`;
}

/**
 * Build the Redis key for grace-period token storage
 */
export function getLastTokenKey(username: string): string {
  return `chat:token:last:${username.toLowerCase()}`;
}

/**
 * Validate an authentication token
 * Works with any Redis-like client (Upstash, ioredis, etc.)
 */
export async function validateAuthToken(
  redis: RedisLike,
  username: string | undefined | null,
  authToken: string | undefined | null,
  options: { allowExpired?: boolean; refreshOnGrace?: boolean } = {}
): Promise<AuthValidationResult> {
  const { allowExpired = false, refreshOnGrace = false } = options;

  if (!username || !authToken) {
    return { valid: false };
  }

  const normalizedUsername = username.toLowerCase();

  // 1. Check active token: chat:token:user:{username}:{token}
  const userScopedKey = getUserTokenKey(normalizedUsername, authToken);
  const exists = await redis.exists(userScopedKey);
  if (exists) {
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

        if (lastToken === authToken && Date.now() < gracePeriodEnd) {
          // Token is within grace period
          if (refreshOnGrace) {
            // Generate new token and return it
            const newToken = generateToken();

            // Store old token for future grace period use
            await redis.set(
              lastTokenKey,
              JSON.stringify({ token: authToken, expiredAt: Date.now() }),
              { ex: TOKEN_GRACE_PERIOD }
            );

            // Issue new token
            const newUserScopedKey = getUserTokenKey(
              normalizedUsername,
              newToken
            );
            await redis.set(newUserScopedKey, Date.now(), {
              ex: USER_TTL_SECONDS,
            });

            return { valid: true, expired: true, newToken };
          }

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
 * Generate a secure token (Edge-compatible using Web Crypto API)
 */
export function generateToken(): string {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  return Array.from(tokenBytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Extract auth credentials from request headers
 */
export function extractAuthFromRequest(request: Request): {
  username: string | null;
  token: string | null;
} {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { username: null, token: null };
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const username = request.headers.get("x-username");

  return { username, token };
}
