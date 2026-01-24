/**
 * Password storage utilities (Edge-compatible)
 * 
 * These functions handle password hash storage in Redis.
 * They do NOT use bcrypt and are safe for Edge runtime.
 */

import type { Redis } from "@upstash/redis";
import { PASSWORD_HASH_PREFIX } from "./_constants.js";

// Re-export constants for convenience
export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./_constants.js";

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
