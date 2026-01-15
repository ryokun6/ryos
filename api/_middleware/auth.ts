/**
 * Authentication middleware for API routes
 * Edge-compatible (no bcrypt dependency)
 */

import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, TTL, ADMIN_USERNAME } from "../_lib/constants.js";
import { unauthorized, invalidToken, forbidden, adminRequired } from "../_lib/errors.js";
import { jsonError, withCors } from "../_lib/response.js";
import type { AuthContext, Handler, AuthenticatedHandler } from "../_lib/types.js";
import { logInfo } from "../_lib/logging.js";

// =============================================================================
// Token Functions
// =============================================================================

/**
 * Build the Redis key for user-specific tokens
 */
function getUserTokenKey(username: string, token: string): string {
  return `${REDIS_KEYS.AUTH_TOKEN_USER}${username.toLowerCase()}:${token}`;
}

/**
 * Build the Redis key for grace-period token storage
 */
function getLastTokenKey(username: string): string {
  return `${REDIS_KEYS.AUTH_TOKEN_LAST}${username.toLowerCase()}`;
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

// =============================================================================
// Auth Extraction
// =============================================================================

/**
 * Extract auth credentials from request headers
 */
export function extractAuth(req: Request): { username: string | null; token: string | null } {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { username: null, token: null };
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const username = req.headers.get("x-username");

  return { username, token };
}

// =============================================================================
// Auth Validation
// =============================================================================

export interface ValidateAuthOptions {
  /** Allow expired tokens within grace period */
  allowExpired?: boolean;
  /** Auto-refresh token if within grace period */
  refreshOnGrace?: boolean;
}

export interface AuthValidationResult {
  valid: boolean;
  expired?: boolean;
  newToken?: string;
}

/**
 * Validate an authentication token
 */
export async function validateAuthToken(
  username: string | undefined | null,
  authToken: string | undefined | null,
  options: ValidateAuthOptions = {}
): Promise<AuthValidationResult> {
  const { allowExpired = false, refreshOnGrace = false } = options;

  if (!username || !authToken) {
    return { valid: false };
  }

  const redis = getRedis();
  const normalizedUsername = username.toLowerCase();

  // 1. Check active token
  const userScopedKey = getUserTokenKey(normalizedUsername, authToken);
  const exists = await redis.exists(userScopedKey);
  
  if (exists) {
    // Refresh TTL on valid token
    await redis.expire(userScopedKey, TTL.USER_EXPIRATION);
    return { valid: true, expired: false };
  }

  // 2. Check grace period for recently expired tokens
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
        const gracePeriodEnd = expiredAt + TTL.TOKEN_GRACE_PERIOD * 1000;

        if (lastToken === authToken && Date.now() < gracePeriodEnd) {
          // Token is within grace period
          if (refreshOnGrace) {
            // Generate new token and return it
            const newToken = generateToken();

            // Store old token for future grace period use
            await redis.set(
              lastTokenKey,
              JSON.stringify({ token: authToken, expiredAt: Date.now() }),
              { ex: TTL.TOKEN_GRACE_PERIOD }
            );

            // Issue new token
            const newUserScopedKey = getUserTokenKey(normalizedUsername, newToken);
            await redis.set(newUserScopedKey, Date.now(), {
              ex: TTL.USER_EXPIRATION,
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
 * Get full auth context from request
 */
export async function getAuthContext(
  req: Request,
  options: ValidateAuthOptions = {}
): Promise<AuthContext> {
  const { username, token } = extractAuth(req);
  
  if (!username || !token) {
    return {
      valid: false,
      username: null,
      token: null,
      isAdmin: false,
    };
  }

  const result = await validateAuthToken(username, token, options);
  
  return {
    valid: result.valid,
    username: result.valid ? username.toLowerCase() : null,
    token: result.valid ? token : null,
    expired: result.expired,
    isAdmin: result.valid && username.toLowerCase() === ADMIN_USERNAME,
  };
}

// =============================================================================
// Middleware Wrappers
// =============================================================================

export interface WithAuthOptions {
  /** Require authentication (401 if not authenticated) */
  required?: boolean;
  /** Require admin access (403 if not admin) */
  admin?: boolean;
  /** Allow expired tokens within grace period */
  allowExpired?: boolean;
}

/**
 * Wrap a handler with authentication
 */
export function withAuth(
  handler: AuthenticatedHandler,
  options: WithAuthOptions = {}
): Handler {
  const { required = true, admin = false, allowExpired = true } = options;

  return async (req: Request): Promise<Response> => {
    const auth = await getAuthContext(req, { allowExpired });
    
    if (required && !auth.valid) {
      return jsonError(unauthorized());
    }
    
    if (admin && !auth.isAdmin) {
      return jsonError(adminRequired());
    }

    return handler(req, auth);
  };
}

/**
 * Wrap a handler with authentication and CORS
 */
export function withAuthAndCors(
  handler: AuthenticatedHandler,
  options: WithAuthOptions = {},
  origin: string | null = null
): Handler {
  return async (req: Request): Promise<Response> => {
    const auth = await getAuthContext(req, { allowExpired: options.allowExpired ?? true });
    
    if (options.required !== false && !auth.valid) {
      const response = jsonError(unauthorized());
      return origin ? withCors(response, origin) : response;
    }
    
    if (options.admin && !auth.isAdmin) {
      const response = jsonError(adminRequired());
      return origin ? withCors(response, origin) : response;
    }

    const response = await handler(req, auth);
    return origin ? withCors(response, origin) : response;
  };
}

// =============================================================================
// Token Management
// =============================================================================

/**
 * Store a token for a user
 */
export async function storeToken(username: string, token: string): Promise<void> {
  if (!token) return;
  const redis = getRedis();
  const normalizedUsername = username.toLowerCase();
  
  await redis.set(getUserTokenKey(normalizedUsername, token), Date.now(), {
    ex: TTL.USER_EXPIRATION,
  });
}

/**
 * Delete a single auth token
 */
export async function deleteToken(token: string): Promise<void> {
  if (!token) return;
  const redis = getRedis();
  
  // Find user-scoped token key(s) and delete
  const pattern = `${REDIS_KEYS.AUTH_TOKEN_USER}*:${token}`;
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
export async function deleteAllUserTokens(username: string): Promise<number> {
  const redis = getRedis();
  const normalizedUsername = username.toLowerCase();
  let deletedCount = 0;

  // Delete all active tokens
  const pattern = `${REDIS_KEYS.AUTH_TOKEN_USER}${normalizedUsername}:*`;
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
export async function getUserTokens(username: string): Promise<Array<{ token: string; createdAt: number | string | null }>> {
  const redis = getRedis();
  const pattern = `${REDIS_KEYS.AUTH_TOKEN_USER}${username.toLowerCase()}:*`;
  const tokens: Array<{ token: string; createdAt: number | string | null }> = [];
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
 * Store a last-token record used for grace-period refreshes
 */
export async function storeLastValidToken(
  username: string,
  token: string,
  expiredAtMs: number = Date.now(),
  ttlSeconds: number = TTL.TOKEN_GRACE_PERIOD
): Promise<void> {
  const redis = getRedis();
  const lastTokenKey = getLastTokenKey(username.toLowerCase());
  const tokenData = {
    token,
    expiredAt: expiredAtMs,
  };
  await redis.set(lastTokenKey, JSON.stringify(tokenData), {
    ex: ttlSeconds,
  });
}

/**
 * Check if user is admin with valid authentication
 */
export async function isAdmin(username: string | null, token: string | null): Promise<boolean> {
  if (!username || !token) return false;
  if (username.toLowerCase() !== ADMIN_USERNAME) return false;

  const result = await validateAuthToken(username, token);
  return result.valid;
}
