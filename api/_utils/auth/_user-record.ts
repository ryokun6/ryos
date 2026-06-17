/**
 * Helpers for reading and updating the stored user record.
 *
 * The record is persisted as a JSON string (or, on some Redis backends, an
 * already-parsed object), so callers must tolerate both shapes.
 */

import type { Redis } from "../redis.js";
import { CHAT_USERS_PREFIX } from "./_constants.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";

export interface StoredUserRecord {
  username?: string;
  createdAt?: number;
  lastActive?: number;
  timeZone?: string;
  timeZoneUpdatedAt?: number;
  banned?: boolean;
  banReason?: string;
  bannedAt?: number;
}

/**
 * Parse a raw `chat:users:{username}` value into a user record.
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

export function getLegacyStoredUserKey(username: string): string {
  return `${CHAT_USERS_PREFIX}${username.toLowerCase()}`;
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
    (await redis.get(redisKeys.auth.userProfile(normalizedUsername))) ??
      (await redis.get(getLegacyStoredUserKey(normalizedUsername)))
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

  const key = redisKeys.auth.userProfile(username.toLowerCase());
  const existingRecord = await getStoredUserRecord(redis, username);
  if (!existingRecord) {
    return null;
  }

  if (existingRecord.timeZone === normalizedTimeZone) {
    return existingRecord;
  }

  const updatedRecord: StoredUserRecord = {
    ...existingRecord,
    timeZone: normalizedTimeZone,
    timeZoneUpdatedAt: now,
  };
  await redis.set(key, JSON.stringify(updatedRecord));
  return updatedRecord;
}
