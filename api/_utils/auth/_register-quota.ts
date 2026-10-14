import { makeKey } from "../_rate-limit-key.js";

/** Registration attempts (creates, logins-via-register, and invalid bodies). */
export const REGISTER_ATTEMPT_LIMIT = 20;
export const REGISTER_ATTEMPT_WINDOW_SECONDS = 6 * 60 * 60;
export const REGISTER_ATTEMPT_BLOCK_SECONDS = 24 * 60 * 60;

/** New accounts per IP. A 7-day window, then a longer block once exceeded. */
export const REGISTER_IP_CREATE_LIMIT = 2;
export const REGISTER_IP_CREATE_WINDOW_SECONDS = 7 * 24 * 60 * 60;
export const REGISTER_IP_CREATE_BLOCK_SECONDS = 14 * 24 * 60 * 60;

/** New accounts per browser. The httpOnly device cookie is the identity. */
export const REGISTER_DEVICE_CREATE_LIMIT = 1;
export const REGISTER_DEVICE_CREATE_WINDOW_SECONDS = 30 * 24 * 60 * 60;
export const REGISTER_DEVICE_CREATE_BLOCK_SECONDS = 30 * 24 * 60 * 60;

export const REGISTER_LIMIT_MESSAGE =
  "Too many registration attempts. Please try again later.";

export interface RegisterQuotaRedis {
  get(key: string): Promise<unknown>;
  incr(key: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  set(key: string, value: string, options: { ex: number }): Promise<unknown>;
  ttl(key: string): Promise<unknown>;
}

export type RegisterQuotaDecision =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

function asCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) ? count : 0;
}

async function retryAfter(
  redis: RegisterQuotaRedis,
  key: string,
  fallback: number
): Promise<number> {
  const ttl = asCount(await redis.ttl(key));
  return ttl > 0 ? ttl : fallback;
}

async function blocked(
  redis: RegisterQuotaRedis,
  key: string,
  fallback: number
): Promise<RegisterQuotaDecision | null> {
  const existing = await redis.get(key);
  if (!existing) return null;
  return { allowed: false, retryAfter: await retryAfter(redis, key, fallback) };
}

/**
 * Count one call to `/api/auth/register`. Exceeding the 6-hour window sets a
 * 24-hour block so waiting out a one-minute counter does not open another burst.
 */
export async function consumeRegistrationAttempt(
  redis: RegisterQuotaRedis,
  ip: string
): Promise<RegisterQuotaDecision> {
  const blockKey = makeKey(["rl", "block", "auth:register", "attempt", "ip", ip]);
  const alreadyBlocked = await blocked(
    redis,
    blockKey,
    REGISTER_ATTEMPT_BLOCK_SECONDS
  );
  if (alreadyBlocked) return alreadyBlocked;

  const attemptKey = makeKey(["rl", "auth:register", "attempt", "ip", ip]);
  const count = asCount(await redis.incr(attemptKey));
  if (count === 1) {
    await redis.expire(attemptKey, REGISTER_ATTEMPT_WINDOW_SECONDS);
  }
  if (count > REGISTER_ATTEMPT_LIMIT) {
    await redis.set(blockKey, "1", { ex: REGISTER_ATTEMPT_BLOCK_SECONDS });
    return { allowed: false, retryAfter: REGISTER_ATTEMPT_BLOCK_SECONDS };
  }
  return { allowed: true };
}

/**
 * Count one new account. The same device may create one account per 30 days.
 * The same IP may create two per 7 days; a further create blocks that IP
 * for 14 days. Logging into an existing username does not call this.
 */
export async function consumeRegistrationCreate(
  redis: RegisterQuotaRedis,
  ip: string,
  deviceId: string
): Promise<RegisterQuotaDecision> {
  const ipBlockKey = makeKey(["rl", "block", "auth:register", "create", "ip", ip]);
  const deviceBlockKey = makeKey([
    "rl",
    "block",
    "auth:register",
    "create",
    "device",
    deviceId,
  ]);

  const ipBlocked = await blocked(
    redis,
    ipBlockKey,
    REGISTER_IP_CREATE_BLOCK_SECONDS
  );
  if (ipBlocked) return ipBlocked;
  const deviceBlocked = await blocked(
    redis,
    deviceBlockKey,
    REGISTER_DEVICE_CREATE_BLOCK_SECONDS
  );
  if (deviceBlocked) return deviceBlocked;

  const ipKey = makeKey(["rl", "auth:register", "create", "ip", ip]);
  const ipCount = asCount(await redis.incr(ipKey));
  if (ipCount === 1) {
    await redis.expire(ipKey, REGISTER_IP_CREATE_WINDOW_SECONDS);
  }
  if (ipCount > REGISTER_IP_CREATE_LIMIT) {
    await redis.set(ipBlockKey, "1", { ex: REGISTER_IP_CREATE_BLOCK_SECONDS });
    return { allowed: false, retryAfter: REGISTER_IP_CREATE_BLOCK_SECONDS };
  }

  const deviceKey = makeKey(["rl", "auth:register", "create", "device", deviceId]);
  const deviceCount = asCount(await redis.incr(deviceKey));
  if (deviceCount === 1) {
    await redis.expire(deviceKey, REGISTER_DEVICE_CREATE_WINDOW_SECONDS);
  }
  if (deviceCount > REGISTER_DEVICE_CREATE_LIMIT) {
    await redis.set(deviceBlockKey, "1", {
      ex: REGISTER_DEVICE_CREATE_BLOCK_SECONDS,
    });
    return { allowed: false, retryAfter: REGISTER_DEVICE_CREATE_BLOCK_SECONDS };
  }

  return { allowed: true };
}
