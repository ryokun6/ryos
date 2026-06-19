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
