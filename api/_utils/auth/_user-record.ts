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

export type StoredUserRecordWithCreatedAt = StoredUserRecord & {
  createdAt: number;
};

/** Basic email shape check. Intentionally permissive (server is not an MX validator). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ENSURE_STORED_USER_CREATED_AT_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then
  return false
end

local decoded, account = pcall(cjson.decode, raw)
if not decoded or type(account) ~= "table" then
  return false
end

local createdAt = account["createdAt"]
if type(createdAt) == "number" and createdAt > 0 and createdAt < math.huge then
  return raw
end
if createdAt ~= nil then
  return false
end

if redis.call("EXISTS", KEYS[2]) == 1 then
  return false
end

local lastActive = account["lastActive"]
if type(lastActive) ~= "number"
  or lastActive ~= lastActive
  or lastActive <= 0
  or lastActive >= math.huge
then
  return false
end

local ttl = redis.call("PTTL", KEYS[1])
account["createdAt"] = lastActive
local encoded, updated = pcall(cjson.encode, account)
if not encoded then
  return false
end
redis.call("SET", KEYS[1], updated)
if ttl >= 0 then
  redis.call("PEXPIRE", KEYS[1], math.max(ttl, 1))
end
return updated
`;

const CREATE_STORED_USER_IF_NOT_EXISTS_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 or redis.call("EXISTS", KEYS[1]) == 1 then
  return 0
end

redis.call("SET", KEYS[1], ARGV[1])
return 1
`;

const UPDATE_STORED_USER_LAST_ACTIVE_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 then
  return 0
end

local raw = redis.call("GET", KEYS[1])
if not raw then
  return 0
end

local decoded, account = pcall(cjson.decode, raw)
if not decoded or type(account) ~= "table" then
  return 0
end

local lastActive = tonumber(ARGV[1])
if not lastActive
  or lastActive ~= lastActive
  or lastActive <= 0
  or lastActive >= math.huge
then
  return 0
end

local currentLastActive = account["lastActive"]
if type(currentLastActive) == "number"
  and currentLastActive == currentLastActive
  and currentLastActive > lastActive
  and currentLastActive < math.huge
then
  lastActive = currentLastActive
end

account["lastActive"] = lastActive
local encoded, updated = pcall(cjson.encode, account)
if not encoded then
  return 0
end

redis.call("SET", KEYS[1], updated)
return 1
`;

const UPDATE_STORED_USER_TIME_ZONE_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 then
  return false
end

local raw = redis.call("GET", KEYS[1])
if not raw then
  return false
end

local decoded, account = pcall(cjson.decode, raw)
if not decoded or type(account) ~= "table" then
  return false
end
if account["timeZone"] == ARGV[1] then
  return raw
end

account["timeZone"] = ARGV[1]
account["timeZoneUpdatedAt"] = tonumber(ARGV[2])
local encoded, updated = pcall(cjson.encode, account)
if not encoded then
  return false
end

redis.call("SET", KEYS[1], updated)
return updated
`;

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

/**
 * Return an account-generation timestamp for current and legacy profiles.
 *
 * Historical profiles may predate `createdAt`. Their existing `lastActive`
 * value is the only stable timestamp available for an account-generation
 * fence. The Lua script backfills it atomically and preserves the record's TTL.
 * A deletion tombstone blocks backfills until registration establishes a new
 * account generation.
 */
export async function ensureStoredUserCreatedAt(
  redis: Redis,
  username: string
): Promise<StoredUserRecordWithCreatedAt | null> {
  const normalizedUsername = username.toLowerCase();
  const result = await redis.eval<unknown>(
    ENSURE_STORED_USER_CREATED_AT_SCRIPT,
    [
      redisKeys.auth.userProfile(normalizedUsername),
      redisKeys.chat.aiConversationTombstone(normalizedUsername),
    ],
    []
  );
  const record = parseStoredUser(result);
  if (
    !record ||
    typeof record.createdAt !== "number" ||
    !Number.isFinite(record.createdAt) ||
    record.createdAt <= 0
  ) {
    return null;
  }
  return { ...record, createdAt: record.createdAt };
}

/**
 * Update activity without replacing the rest of the profile.
 *
 * Room-message requests can overlap profile migrations, account deletion, and
 * re-registration. An atomic field patch prevents a stale request from
 * erasing `createdAt` or recreating a deleted profile.
 */
export async function updateStoredUserLastActive(
  redis: Redis,
  username: string,
  lastActive: number
): Promise<boolean> {
  if (!Number.isFinite(lastActive) || lastActive <= 0) {
    return false;
  }

  const normalizedUsername = username.toLowerCase();
  const result = await redis.eval<number>(
    UPDATE_STORED_USER_LAST_ACTIVE_SCRIPT,
    [
      redisKeys.auth.userProfile(normalizedUsername),
      redisKeys.chat.aiConversationTombstone(normalizedUsername),
    ],
    [lastActive]
  );
  return result === 1;
}

/**
 * Create a profile only when neither an account nor a deletion tombstone
 * exists. This keeps stale room requests from recreating deleted accounts or
 * overwriting a concurrent registration.
 */
export async function createStoredUserIfNotExists(
  redis: Redis,
  username: string,
  record: StoredUserRecord
): Promise<boolean> {
  const normalizedUsername = username.toLowerCase();
  const result = await redis.eval<number>(
    CREATE_STORED_USER_IF_NOT_EXISTS_SCRIPT,
    [
      redisKeys.auth.userProfile(normalizedUsername),
      redisKeys.chat.aiConversationTombstone(normalizedUsername),
    ],
    [JSON.stringify(record)]
  );
  return result === 1;
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
  if (!Number.isFinite(now) || now <= 0) {
    return null;
  }

  const normalizedUsername = username.toLowerCase();
  const result = await redis.eval<unknown>(
    UPDATE_STORED_USER_TIME_ZONE_SCRIPT,
    [
      redisKeys.auth.userProfile(normalizedUsername),
      redisKeys.chat.aiConversationTombstone(normalizedUsername),
    ],
    [normalizedTimeZone, now]
  );
  return parseStoredUser(result);
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
