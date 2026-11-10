import type { Redis } from "../../_utils/redis.js";
import type { ApiRequest, ApiResponse } from "../../_utils/api-types.js";
import { getHeader } from "../../_utils/request-helpers.js";
import {
  isLoginLocked,
  recordLoginFailure,
  resetLoginFailures,
  PER_USER_LOCKOUT_SECONDS,
  USER_TTL_SECONDS,
} from "../../_utils/auth/index.js";
import {
  hashPassword,
  verifyPassword,
} from "../../_utils/auth/_password.js";
import { secretsEqual } from "../../_utils/_secret-compare.js";
import {
  checkCounterLimit,
  getClientIp,
  makeKey,
} from "../../_utils/_rate-limit.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";
import { md5Hex } from "../../../src/shared/kosync/md5.js";
import {
  isValidKosyncField,
  isValidKosyncKeyField,
} from "./_md5.js";
import { KosyncErrorCode, sendKosyncError } from "./_errors.js";

/** Match OPDS: generous enough for e-reader retries, still bounds guessing. */
const KOSYNC_AUTH_RATE_LIMIT = 120;
const KOSYNC_AUTH_RATE_WINDOW_SECONDS = 60;

export type KosyncAuthResult =
  | { kind: "authenticated"; username: string }
  | { kind: "unauthorized" }
  | { kind: "rate_limited"; retryAfter: number };

export function kosyncUserKey(username: string): string {
  return redisKeys.integration.kosyncUserKey(username.toLowerCase());
}

/**
 * Pre-migration kosync keys were the raw 32-hex MD5 of the account password.
 * New keys are bcrypt hashes of that MD5 (KOReader still sends md5 on the wire).
 */
export function isLegacyKosyncAuthKey(stored: string): boolean {
  return /^[a-f0-9]{32}$/i.test(stored);
}

export function isHashedKosyncAuthKey(stored: string): boolean {
  return (
    stored.startsWith("$2a$") ||
    stored.startsWith("$2b$") ||
    stored.startsWith("$2y$")
  );
}

export async function getKosyncAuthKey(
  redis: Redis,
  username: string
): Promise<string | null> {
  const raw = await redis.get<string>(kosyncUserKey(username));
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Persist a kosync auth verifier derived from the KOReader MD5 key.
 * Stores bcrypt(md5), never the raw unsalted MD5.
 */
export async function setKosyncAuthKey(
  redis: Redis,
  username: string,
  md5Password: string
): Promise<void> {
  const normalized = md5Password.toLowerCase();
  const hash = await hashPassword(normalized);
  await redis.set(kosyncUserKey(username), hash, {
    ex: USER_TTL_SECONDS,
  });
}

/**
 * Keep the kosync auth key in sync with the ryOS account password.
 * KOReader only sends `md5(plain)` — we store bcrypt(md5(plain)) whenever
 * the plain password is known (login / register / password change / recovery).
 */
export async function syncKosyncAuthKeyFromPlainPassword(
  redis: Redis,
  username: string,
  plainPassword: string
): Promise<void> {
  if (!plainPassword) return;
  await setKosyncAuthKey(redis, username, md5Hex(plainPassword));
}

/**
 * Verify a KOReader MD5 key against the stored kosync verifier.
 * On success against a legacy raw-MD5 value, upgrades the Redis entry to bcrypt.
 */
export async function verifyKosyncAuthKey(
  redis: Redis,
  username: string,
  md5Key: string,
  stored: string
): Promise<boolean> {
  const provided = md5Key.toLowerCase();

  if (isHashedKosyncAuthKey(stored)) {
    return verifyPassword(provided, stored);
  }

  if (isLegacyKosyncAuthKey(stored)) {
    if (!secretsEqual(provided, stored.toLowerCase())) {
      return false;
    }
    // Successful auth against a legacy unsalted MD5 — rehash in place.
    await setKosyncAuthKey(redis, username, provided);
    return true;
  }

  return false;
}

/**
 * Authorize a kosync request via `X-Auth-User` + `X-Auth-Key` (MD5 password).
 * Applies per-IP rate limits and the shared per-username login lockout so
 * kosync cannot be used as an unbounded password-guessing oracle.
 */
export async function authorizeKosyncRequest(
  req: ApiRequest,
  redis: Redis
): Promise<KosyncAuthResult> {
  const authUser = getHeader(req, "x-auth-user");
  const authKey = getHeader(req, "x-auth-key");
  if (!isValidKosyncKeyField(authUser) || !isValidKosyncField(authKey)) {
    return { kind: "unauthorized" };
  }
  if (!/^[a-f0-9]{32}$/i.test(authKey)) {
    return { kind: "unauthorized" };
  }

  const username = authUser.toLowerCase();

  const rateLimit = await checkCounterLimit({
    redis,
    key: makeKey(["rl", "kosync:auth", "ip", getClientIp(req)]),
    windowSeconds: KOSYNC_AUTH_RATE_WINDOW_SECONDS,
    limit: KOSYNC_AUTH_RATE_LIMIT,
  });
  if (!rateLimit.allowed) {
    return {
      kind: "rate_limited",
      retryAfter: rateLimit.resetSeconds,
    };
  }

  const [stored, locked] = await Promise.all([
    getKosyncAuthKey(redis, username),
    isLoginLocked(redis, username),
  ]);

  if (locked) {
    return {
      kind: "rate_limited",
      retryAfter: PER_USER_LOCKOUT_SECONDS,
    };
  }

  if (!stored) {
    return { kind: "unauthorized" };
  }

  const valid = await verifyKosyncAuthKey(redis, username, authKey, stored);
  if (!valid) {
    await recordLoginFailure(redis, username);
    return { kind: "unauthorized" };
  }

  await resetLoginFailures(redis, username);
  // Refresh TTL on successful auth so active syncers stay alive.
  await redis.expire(kosyncUserKey(username), USER_TTL_SECONDS);
  return { kind: "authenticated", username };
}

export function sendKosyncAuthFailure(
  res: ApiResponse,
  result: Exclude<KosyncAuthResult, { kind: "authenticated" }>,
  loggerResponse?: (status: number) => void
): void {
  if (result.kind === "rate_limited") {
    res.setHeader("Retry-After", String(result.retryAfter));
    loggerResponse?.(429);
    res.status(429).json({
      code: KosyncErrorCode.INTERNAL,
      message: "Too many authentication attempts.",
    });
    return;
  }
  sendKosyncError(res, KosyncErrorCode.UNAUTHORIZED);
}
