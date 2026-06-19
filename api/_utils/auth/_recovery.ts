/**
 * Shared helpers for short-lived, single-use recovery codes used by the
 * password-reset and email-verification flows.
 *
 * Codes are short numeric strings that are easy to copy from a Telegram DM or
 * email. The raw code is NEVER stored in Redis — only a SHA-256 hash salted
 * with the username — so a Redis dump cannot be used to complete a reset.
 */

import type { Redis } from "../redis.js";
import { sha256RedisIdentifier } from "../../../src/shared/redisKeys.js";

/** Default lifetime for a recovery/verification code. */
export const RECOVERY_CODE_TTL_SECONDS = 15 * 60;

/** Maximum verification attempts before a code is burned. */
export const RECOVERY_CODE_MAX_ATTEMPTS = 5;

/** Number of digits in a generated code. */
export const RECOVERY_CODE_LENGTH = 6;

interface StoredRecoveryCode {
  codeHash: string;
  createdAt: number;
  attempts: number;
}

export type RecoveryVerifyReason =
  | "missing"
  | "mismatch"
  | "too_many_attempts";

export interface RecoveryVerifyResult {
  ok: boolean;
  reason?: RecoveryVerifyReason;
}

/**
 * Generate a cryptographically-random numeric code of the given length.
 * Uses rejection sampling so the digit distribution is uniform.
 */
export function generateRecoveryCode(length: number = RECOVERY_CODE_LENGTH): string {
  const digits: string[] = [];
  const buf = new Uint8Array(1);
  while (digits.length < length) {
    crypto.getRandomValues(buf);
    // Reject values >= 250 so 0-249 maps evenly across 0-9 (250 = 25*10).
    if (buf[0] >= 250) continue;
    digits.push(String(buf[0] % 10));
  }
  return digits.join("");
}

function hashCode(username: string, code: string): Promise<string> {
  return sha256RedisIdentifier(`${username.toLowerCase()}:${code}`);
}

function parseStoredCode(raw: unknown): StoredRecoveryCode | null {
  if (!raw) return null;
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as StoredRecoveryCode)
        : (raw as StoredRecoveryCode);
    if (
      !parsed ||
      typeof parsed.codeHash !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }
    return {
      codeHash: parsed.codeHash,
      createdAt: parsed.createdAt,
      attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a code, persist its hash under `key`, and return the raw code so the
 * caller can deliver it. TTL expiry handles invalidation automatically.
 */
export async function issueRecoveryCode(
  redis: Redis,
  key: string,
  username: string,
  options: { ttlSeconds?: number; length?: number } = {}
): Promise<string> {
  const code = generateRecoveryCode(options.length ?? RECOVERY_CODE_LENGTH);
  const codeHash = await hashCode(username, code);
  const record: StoredRecoveryCode = {
    codeHash,
    createdAt: Date.now(),
    attempts: 0,
  };
  await redis.set(key, JSON.stringify(record), {
    ex: options.ttlSeconds ?? RECOVERY_CODE_TTL_SECONDS,
  });
  return code;
}

/**
 * Verify a submitted code against the stored hash. On success the code is
 * deleted (single-use). On mismatch the attempt counter is incremented and the
 * code is burned once the attempt limit is reached.
 *
 * An absent/expired code returns `{ ok: false, reason: "missing" }` — callers
 * should treat this the same as a mismatch to avoid leaking timing/existence.
 */
export async function consumeRecoveryCode(
  redis: Redis,
  key: string,
  username: string,
  code: string
): Promise<RecoveryVerifyResult> {
  if (!code || typeof code !== "string") {
    return { ok: false, reason: "missing" };
  }

  const stored = parseStoredCode(await redis.get(key));
  if (!stored) {
    return { ok: false, reason: "missing" };
  }

  if (stored.attempts >= RECOVERY_CODE_MAX_ATTEMPTS) {
    await redis.del(key);
    return { ok: false, reason: "too_many_attempts" };
  }

  const submittedHash = await hashCode(username, code.trim());
  if (submittedHash !== stored.codeHash) {
    const nextAttempts = stored.attempts + 1;
    if (nextAttempts >= RECOVERY_CODE_MAX_ATTEMPTS) {
      await redis.del(key);
      return { ok: false, reason: "too_many_attempts" };
    }
    // Preserve the remaining TTL while bumping the attempt counter.
    const ttl = await redis.ttl(key);
    const record: StoredRecoveryCode = { ...stored, attempts: nextAttempts };
    if (typeof ttl === "number" && ttl > 0) {
      await redis.set(key, JSON.stringify(record), { ex: ttl });
    } else {
      await redis.set(key, JSON.stringify(record));
    }
    return { ok: false, reason: "mismatch" };
  }

  // Correct code — single use.
  await redis.del(key);
  return { ok: true };
}
