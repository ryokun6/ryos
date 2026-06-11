/**
 * Per-username login lockout.
 *
 * Shared by `/api/auth/login` and the existing-user login path of
 * `/api/auth/register` so that password-guessing is throttled identically
 * regardless of which endpoint is used (the register path previously bypassed
 * this entirely). Both endpoints operate on the same Redis keys, so failures
 * accumulate across them.
 *
 * - 20 failed attempts within 1 hour → 1-hour hard lockout.
 * - The failure counter keeps incrementing during a lockout, so a sustained
 *   attack keeps re-arming the lock.
 * - A successful login resets the counter.
 */

import type { Redis } from "../redis.js";

export const PER_USER_FAIL_LIMIT = 20;
export const PER_USER_FAIL_WINDOW_SECONDS = 60 * 60;
export const PER_USER_LOCKOUT_SECONDS = 60 * 60;

function loginBlockKey(username: string): string {
  return `rl:block:auth:login:user:${username.toLowerCase()}`;
}

function loginFailKey(username: string): string {
  return `rl:auth:login:user-fail:${username.toLowerCase()}`;
}

/**
 * Whether the username is currently locked out from login attempts.
 */
export async function isLoginLocked(
  redis: Redis,
  username: string
): Promise<boolean> {
  return Boolean(await redis.get(loginBlockKey(username)));
}

/**
 * Record a failed login attempt for a username, arming a lockout once the
 * failure threshold is exceeded.
 */
export async function recordLoginFailure(
  redis: Redis,
  username: string
): Promise<void> {
  const failKey = loginFailKey(username);
  const failCount = await redis.incr(failKey);
  if (failCount === 1) {
    await redis.expire(failKey, PER_USER_FAIL_WINDOW_SECONDS);
  }
  if (failCount > PER_USER_FAIL_LIMIT) {
    await redis.set(loginBlockKey(username), "1", {
      ex: PER_USER_LOCKOUT_SECONDS,
    });
  }
}

/**
 * Reset the failure counter after a successful login. Non-fatal on error —
 * the counter expires on its own.
 */
export async function resetLoginFailures(
  redis: Redis,
  username: string
): Promise<void> {
  try {
    await redis.del(loginFailKey(username));
  } catch {
    // Non-fatal; counter will expire on its own.
  }
}
