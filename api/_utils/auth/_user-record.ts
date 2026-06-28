/**
 * Helpers for reading and updating the stored user record.
 *
 * The record is persisted as a JSON string (or, on some Redis backends, an
 * already-parsed object), so callers must tolerate both shapes.
 */

import type { Redis } from "../redis.js";
import {
  redisKeys,
  sha256RedisIdentifier,
} from "../../../src/shared/redisKeys.js";
import { USER_EXPIRATION_TIME } from "./_constants.js";

export interface StoredUserRecord {
  username?: string;
  createdAt?: number;
  lastActive?: number;
  timeZone?: string;
  timeZoneUpdatedAt?: number;
  banned?: boolean;
  banReason?: string;
  bannedAt?: number;
  /** Recovery email (normalized, lowercase) once the user has added one. */
  email?: string;
  /** Whether the recovery email has been verified via a code. */
  emailVerified?: boolean;
  /** When the recovery email was last set/changed. */
  emailUpdatedAt?: number;
}

const CREATE_ACCOUNT_SCRIPT = `
-- ryos-create-auth-account
if redis.call("EXISTS", KEYS[1]) == 1 then
  return 0
end
redis.call("SET", KEYS[1], ARGV[1])
redis.call("SET", KEYS[2], ARGV[2])
redis.call("SET", KEYS[3], ARGV[3], "EX", ARGV[5])
redis.call("SADD", KEYS[4], ARGV[4])
redis.call("EXPIRE", KEYS[4], ARGV[5])
return 1
`;

const PATCH_USER_RECORD_SCRIPT = `
-- ryos-patch-user-record
local raw = redis.call("GET", KEYS[1])
if not raw then
  return false
end
local record = cjson.decode(raw)
local patch = cjson.decode(ARGV[1])
for field, value in pairs(patch) do
  record[field] = value
end
local removals = cjson.decode(ARGV[2])
for _, field in ipairs(removals) do
  record[field] = nil
end
local updated = cjson.encode(record)
redis.call("SET", KEYS[1], updated)
return updated
`;

/** Basic email shape check. Intentionally permissive (server is not an MX validator). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return !!normalized && normalized.length <= 254 && EMAIL_REGEX.test(normalized);
}

/**
 * Parse a raw stored user-profile value into a user record.
 * Returns null when the value is missing or malformed.
 */
export function parseStoredUser(userData: unknown): StoredUserRecord | null {
  if (!userData) return null;
  try {
    return typeof userData === "string"
      ? (JSON.parse(userData) as StoredUserRecord)
      : (userData as StoredUserRecord);
  } catch {
    return null;
  }
}

/**
 * Whether a stored user record represents a banned account.
 */
export function isUserBanned(userData: unknown): boolean {
  return parseStoredUser(userData)?.banned === true;
}

/**
 * Validate a browser-provided IANA timezone. Returns null for unknown/invalid
 * values so we never persist misleading prompt context.
 */
export function normalizeUserTimeZone(timeZone?: string | null): string | null {
  if (!timeZone || typeof timeZone !== "string") {
    return null;
  }

  const trimmed = timeZone.trim();
  if (!trimmed || trimmed === "Unknown") {
    return null;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    return null;
  }
}

export async function getStoredUserRecord(
  redis: Redis,
  username: string
): Promise<StoredUserRecord | null> {
  const normalizedUsername = username.toLowerCase();
  return parseStoredUser(
    await redis.get(redisKeys.auth.userProfile(normalizedUsername))
  );
}

export async function setStoredUserRecord(
  redis: Redis,
  username: string,
  record: StoredUserRecord
): Promise<void> {
  await redis.set(
    redisKeys.auth.userProfile(username.toLowerCase()),
    JSON.stringify(record)
  );
}

export async function createStoredUserRecordIfAbsent(
  redis: Redis,
  username: string,
  record: StoredUserRecord
): Promise<boolean> {
  const result = await redis.set(
    redisKeys.auth.userProfile(username.toLowerCase()),
    JSON.stringify(record),
    { nx: true }
  );
  return result !== null;
}

/**
 * Create the profile, password, and first session as one Redis transaction.
 * A concurrent caller for the same username receives false and cannot replace
 * any data written by the winner.
 */
export async function createStoredUserAccount(
  redis: Redis,
  username: string,
  record: StoredUserRecord,
  passwordHash: string,
  tokenHash: string,
  sessionCreatedAt: number = Date.now()
): Promise<boolean> {
  const normalizedUsername = username.toLowerCase();
  const result = await redis.eval<number>(
    CREATE_ACCOUNT_SCRIPT,
    [
      redisKeys.auth.userProfile(normalizedUsername),
      redisKeys.auth.userPassword(normalizedUsername),
      redisKeys.auth.session(tokenHash),
      redisKeys.auth.userSessions(normalizedUsername),
    ],
    [
      JSON.stringify(record),
      passwordHash,
      sessionCreatedAt,
      tokenHash,
      USER_EXPIRATION_TIME,
    ]
  );
  return Number(result) === 1;
}

/**
 * Atomically merge selected profile fields into the current JSON record.
 * This avoids stale read-modify-write callers reverting independent fields
 * such as the admin ban flag.
 */
export async function patchStoredUserRecord(
  redis: Redis,
  username: string,
  patch: Partial<StoredUserRecord>,
  removeFields: ReadonlyArray<keyof StoredUserRecord> = []
): Promise<StoredUserRecord | null> {
  const result = await redis.eval<unknown>(
    PATCH_USER_RECORD_SCRIPT,
    [redisKeys.auth.userProfile(username.toLowerCase())],
    [JSON.stringify(patch), JSON.stringify(removeFields)]
  );
  return parseStoredUser(result);
}

export async function getStoredUserTimeZone(
  redis: Redis | undefined,
  username?: string | null
): Promise<string | null> {
  if (!redis || !username) {
    return null;
  }

  const record = await getStoredUserRecord(redis, username);
  return normalizeUserTimeZone(record?.timeZone);
}

export async function updateStoredUserTimeZone(
  redis: Redis,
  username: string,
  timeZone?: string | null,
  now: number = Date.now()
): Promise<StoredUserRecord | null> {
  const normalizedTimeZone = normalizeUserTimeZone(timeZone);
  if (!normalizedTimeZone) {
    return null;
  }

  const existingRecord = await getStoredUserRecord(redis, username);
  if (!existingRecord) {
    return null;
  }

  if (existingRecord.timeZone === normalizedTimeZone) {
    return existingRecord;
  }

  return patchStoredUserRecord(redis, username, {
    timeZone: normalizedTimeZone,
    timeZoneUpdatedAt: now,
  });
}

/**
 * Resolve a username from a (verified) recovery email via the reverse index.
 * Returns null when no account claims the email.
 */
export async function getUsernameByEmail(
  redis: Redis,
  email: string
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const emailHash = await sha256RedisIdentifier(normalized);
  const username = await redis.get<string>(redisKeys.auth.emailIndex(emailHash));
  return typeof username === "string" && username.length > 0
    ? username.toLowerCase()
    : null;
}

/**
 * Point the email reverse-index at a username. The email is hashed so raw
 * addresses are never used as Redis key material.
 */
export async function setUserEmailIndex(
  redis: Redis,
  email: string,
  username: string
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const emailHash = await sha256RedisIdentifier(normalized);
  await redis.set(redisKeys.auth.emailIndex(emailHash), username.toLowerCase());
}

/**
 * Remove the email reverse-index entry (used when changing/removing an email
 * or deleting an account).
 */
export async function deleteUserEmailIndex(
  redis: Redis,
  email: string
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const emailHash = await sha256RedisIdentifier(normalized);
  await redis.del(redisKeys.auth.emailIndex(emailHash));
}
