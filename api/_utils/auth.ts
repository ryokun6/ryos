/**
 * Authentication utilities for chat-rooms API
 * Handles token management, password hashing, and auth validation
 */

import { Redis } from "@upstash/redis";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { TTL } from "../_lib/constants.js";

// Map old constant names to new
const USER_EXPIRATION_TIME = TTL.USER_EXPIRATION;
const USER_TTL_SECONDS = TTL.USER_EXPIRATION;
const TOKEN_GRACE_PERIOD = TTL.TOKEN_GRACE_PERIOD;

// ============================================================================
// Types
// ============================================================================

export interface AuthValidationResult {
  valid: boolean;
  expired?: boolean;
}

export interface TokenInfo {
  token: string;
  createdAt: number | string | null;
}

export interface ExtractedAuth {
  username: string | null;
  token: string | null;
}

// ============================================================================
// Constants
// ============================================================================

// Token constants
export const AUTH_TOKEN_PREFIX = "chat:token:";
export const TOKEN_LENGTH = 32; // 32 bytes = 256 bits

// Password constants
export const PASSWORD_HASH_PREFIX = "chat:password:";
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_BCRYPT_ROUNDS = 10;

// Re-export TTL constants from central location
export { USER_TTL_SECONDS, USER_EXPIRATION_TIME, TOKEN_GRACE_PERIOD };

// Rate limiting constants for auth actions
export const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute window
export const RATE_LIMIT_ATTEMPTS = 10; // Max attempts per window
export const RATE_LIMIT_PREFIX = "rl:"; // Rate limit key prefix
export const RATE_LIMIT_BLOCK_PREFIX = "rl:block:"; // Blocklist key prefix
export const CREATE_USER_BLOCK_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// ============================================================================
// Redis Client
// ============================================================================

const redis = new Redis({
  url: process.env.REDIS_KV_REST_API_URL,
  token: process.env.REDIS_KV_REST_API_TOKEN,
});

// ============================================================================
// Logging Helpers (minimal - to be replaced by logging module imports)
// ============================================================================

type LogFn = (requestId: string, message: string, data?: unknown) => void;

let logInfoFn: LogFn = (requestId, message, data) => {
  console.log(`[${requestId}] INFO: ${message}`, data ?? "");
};

let logErrorFn: LogFn = (requestId, message, error) => {
  console.error(`[${requestId}] ERROR: ${message}`, error);
};

/**
 * Set custom logging functions (called by chat-rooms.ts to inject its loggers)
 */
export function setAuthLoggers(logInfo: LogFn, logError: LogFn): void {
  logInfoFn = logInfo;
  logErrorFn = logError;
}

// ============================================================================
// Profanity Check (minimal - to be replaced by validation module imports)
// ============================================================================

let isProfaneUsernameFn: (name: string) => boolean = () => false;

/**
 * Set the profanity check function (called by chat-rooms.ts to inject validator)
 */
export function setIsProfaneUsername(fn: (name: string) => boolean): void {
  isProfaneUsernameFn = fn;
}

// ============================================================================
// Password Functions
// ============================================================================

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * Set or update a user's password hash
 */
export async function setUserPasswordHash(
  username: string,
  passwordHash: string
): Promise<void> {
  const passwordKey = `${PASSWORD_HASH_PREFIX}${username.toLowerCase()}`;
  await redis.set(passwordKey, passwordHash);
}

/**
 * Get a user's password hash
 */
export async function getUserPasswordHash(
  username: string
): Promise<string | null> {
  const passwordKey = `${PASSWORD_HASH_PREFIX}${username.toLowerCase()}`;
  return await redis.get(passwordKey);
}

// ============================================================================
// Token Generation & Key Helpers
// ============================================================================

/**
 * Generate a secure authentication token
 */
export function generateAuthToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString("hex");
}

/**
 * Build the Redis key for user-specific tokens (new pattern)
 */
export function getUserTokenKey(username: string, token: string): string {
  return `${AUTH_TOKEN_PREFIX}user:${username.toLowerCase()}:${token}`;
}

/**
 * Get all token keys for a user using pattern matching
 */
export function getUserTokenPattern(username: string): string {
  return `${AUTH_TOKEN_PREFIX}user:${username.toLowerCase()}:*`;
}

// ============================================================================
// Token CRUD Operations
// ============================================================================

/**
 * Persist a freshly generated token for a user
 */
export async function storeToken(
  username: string,
  token: string
): Promise<void> {
  if (!token) return;
  const normalizedUsername = username.toLowerCase();

  // Store in new format: chat:token:user:{username}:{token} -> timestamp
  await redis.set(getUserTokenKey(normalizedUsername, token), Date.now(), {
    ex: USER_EXPIRATION_TIME,
  });
}

/**
 * Delete a single auth token (e.g. on logout or when refreshing)
 */
export async function deleteToken(token: string): Promise<void> {
  if (!token) return;

  // Only new format: find user-scoped token key(s) and delete
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
export async function deleteAllUserTokens(username: string): Promise<number> {
  const normalizedUsername = username.toLowerCase();
  let deletedCount = 0;

  // 1. Delete all active tokens: chat:token:user:{username}:{token}
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

  // 2. Delete grace-period token: chat:token:last:{username}
  const lastTokenKey = `${AUTH_TOKEN_PREFIX}last:${normalizedUsername}`;
  const lastDeleted = await redis.del(lastTokenKey);
  deletedCount += lastDeleted;

  return deletedCount;
}

/**
 * Get all active tokens for a user
 */
export async function getUserTokens(username: string): Promise<TokenInfo[]> {
  const pattern = getUserTokenPattern(username);
  const tokens: TokenInfo[] = [];
  let cursor = 0;

  do {
    const [newCursor, keys] = await redis.scan(cursor, {
      match: pattern,
      count: 100,
    });
    cursor = parseInt(String(newCursor));

    // Extract tokens from keys
    for (const key of keys) {
      const parts = key.split(":");
      const token = parts[parts.length - 1];
      const timestamp = await redis.get<number | string>(key);
      tokens.push({ token, createdAt: timestamp });
    }
  } while (cursor !== 0);

  return tokens;
}

// ============================================================================
// Auth Validation
// ============================================================================

/**
 * Validate authentication for a request
 */
export async function validateAuth(
  username: string | null | undefined,
  token: string | null | undefined,
  requestId: string,
  allowExpired = false
): Promise<AuthValidationResult> {
  if (!username || !token) {
    logInfoFn(requestId, "Auth validation failed: Missing username or token");
    return { valid: false };
  }

  // Block authentication for profane usernames (covers legacy existing accounts)
  if (isProfaneUsernameFn(username)) {
    logInfoFn(requestId, `Auth blocked for profane username: ${username}`);
    return { valid: false };
  }

  const normalizedUsername = username.toLowerCase();

  // 1. NEW preferred path: user-scoped token (chat:token:user:{username}:{token})
  const userTokenKey = getUserTokenKey(normalizedUsername, token);
  const userTokenExists = await redis.exists(userTokenKey);
  if (userTokenExists) {
    await redis.expire(userTokenKey, USER_TTL_SECONDS);
    return { valid: true, expired: false };
  }

  // 2. Grace-period path – allow refresh of recently expired tokens
  if (allowExpired) {
    const lastTokenKey = `${AUTH_TOKEN_PREFIX}last:${normalizedUsername}`;
    const lastTokenData = await redis.get<string>(lastTokenKey);

    if (lastTokenData) {
      try {
        const { token: lastToken, expiredAt } = JSON.parse(lastTokenData);
        const gracePeriodEnd = expiredAt + TOKEN_GRACE_PERIOD * 1000;
        if (lastToken === token && Date.now() < gracePeriodEnd) {
          logInfoFn(
            requestId,
            `Auth validation: Found expired token for user ${username} within grace period`
          );
          return { valid: true, expired: true };
        }
      } catch (e) {
        logErrorFn(requestId, "Error parsing last token data", e);
      }
    }
  }

  logInfoFn(requestId, `Auth validation failed for user ${username}`);
  return { valid: false };
}

/**
 * Store a last-token record used for grace-period refreshes.
 */
export async function storeLastValidToken(
  username: string,
  token: string,
  expiredAtMs: number = Date.now(),
  ttlSeconds: number = TOKEN_GRACE_PERIOD
): Promise<void> {
  const lastTokenKey = `${AUTH_TOKEN_PREFIX}last:${username.toLowerCase()}`;
  const tokenData = {
    token,
    expiredAt: expiredAtMs,
  };
  await redis.set(lastTokenKey, JSON.stringify(tokenData), {
    ex: ttlSeconds,
  });
}

// ============================================================================
// Request Auth Extraction
// ============================================================================

/**
 * Extract authentication from request headers
 */
export function extractAuth(request: Request): ExtractedAuth {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { username: null, token: null };
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const username = request.headers.get("x-username");

  return { username, token };
}

// ============================================================================
// Rate Limiting for Auth Actions
// ============================================================================

/**
 * Check if an action from a specific identifier is rate limited
 * Returns true if allowed, false if rate limited
 * 
 * Uses atomic increment-first approach to prevent TOCTOU race conditions.
 */
export async function checkRateLimit(
  action: string,
  identifier: string,
  requestId: string
): Promise<boolean> {
  try {
    const key = `${RATE_LIMIT_PREFIX}${action}:${identifier}`;
    
    // ATOMIC approach: increment first, then check
    // This prevents race conditions where concurrent requests both see
    // the same count and both pass the limit check
    const newCount = await redis.incr(key);

    // Set TTL only if this is the first increment (count became 1)
    // This is safe because INCR is atomic - only one request will see newCount === 1
    if (newCount === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    // Check if the NEW count exceeds the limit
    if (newCount > RATE_LIMIT_ATTEMPTS) {
      logInfoFn(
        requestId,
        `Rate limit exceeded for ${action} by ${identifier}: ${newCount} attempts`
      );
      return false;
    }

    return true;
  } catch (error) {
    logErrorFn(
      requestId,
      `Rate limit check failed for ${action}:${identifier}`,
      error
    );
    // On error, allow the request (fail open)
    return true;
  }
}

/**
 * Check if an IP is blocked for user creation
 */
export async function isBlockedForUserCreation(ip: string): Promise<boolean> {
  const blockKey = `${RATE_LIMIT_BLOCK_PREFIX}createUser:${ip}`;
  const blocked = await redis.exists(blockKey);
  return blocked === 1;
}

/**
 * Block an IP from creating users
 */
export async function blockIpForUserCreation(ip: string): Promise<void> {
  const blockKey = `${RATE_LIMIT_BLOCK_PREFIX}createUser:${ip}`;
  await redis.set(blockKey, 1, { ex: CREATE_USER_BLOCK_TTL_SECONDS });
}

