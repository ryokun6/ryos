/**
 * Password storage utilities (Edge-compatible)
 * 
 * These functions handle password hash storage in Redis.
 * They do NOT use bcrypt and are safe for Edge runtime.
 */

import type { Redis } from "../redis.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";

// Re-export constants for convenience
export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./_constants.js";

function getCanonicalPasswordKey(username: string): string {
  return redisKeys.auth.userPassword(username);
}

/**
 * Set or update a user's password hash
 */
export async function setUserPasswordHash(
  redis: Redis,
  username: string,
  passwordHash: string
): Promise<void> {
  const key = getCanonicalPasswordKey(username);
  await redis.set(key, passwordHash);
}

/**
 * Get a user's password hash
 */
export async function getUserPasswordHash(
  redis: Redis,
  username: string
): Promise<string | null> {
  return await redis.get<string>(getCanonicalPasswordKey(username));
}

/**
 * Delete a user's password hash
 */
export async function deleteUserPasswordHash(
  redis: Redis,
  username: string
): Promise<void> {
  await redis.del(getCanonicalPasswordKey(username));
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
