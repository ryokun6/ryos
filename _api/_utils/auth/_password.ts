/**
 * Password utilities (Node.js runtime only - uses bcrypt)
 * 
 * Note: This module requires Node.js runtime due to bcrypt dependency.
 * For Edge runtime endpoints, use token-based auth only.
 */

import type { Redis } from "@upstash/redis";
import bcrypt from "bcryptjs";
import {
  PASSWORD_HASH_PREFIX,
  PASSWORD_BCRYPT_ROUNDS,
} from "./_constants.js";

// Re-export constants for convenience
export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./_constants.js";

// ============================================================================
// Password Hashing
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

// ============================================================================
// Password Storage
// ============================================================================

/**
 * Get Redis key for user's password hash
 */
function getPasswordKey(username: string): string {
  return `${PASSWORD_HASH_PREFIX}${username.toLowerCase()}`;
}

/**
 * Set or update a user's password hash
 */
export async function setUserPasswordHash(
  redis: Redis,
  username: string,
  passwordHash: string
): Promise<void> {
  const key = getPasswordKey(username);
  await redis.set(key, passwordHash);
}

/**
 * Get a user's password hash
 */
export async function getUserPasswordHash(
  redis: Redis,
  username: string
): Promise<string | null> {
  const key = getPasswordKey(username);
  return await redis.get(key);
}

/**
 * Delete a user's password hash
 */
export async function deleteUserPasswordHash(
  redis: Redis,
  username: string
): Promise<void> {
  const key = getPasswordKey(username);
  await redis.del(key);
}

/**
 * Check if a user has a password set
 */
export async function userHasPassword(
  redis: Redis,
  username: string
): Promise<boolean> {
  const hash = await getUserPasswordHash(redis, username);
  return !!hash;
}
